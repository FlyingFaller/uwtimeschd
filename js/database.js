import * as sqljsHttpVfs from "https://esm.sh/sql.js-httpvfs@0.8.12?bundle";
const createDbWorker = sqljsHttpVfs.createDbWorker || (sqljsHttpVfs.default && sqljsHttpVfs.default.createDbWorker);

export class DatabaseManager {
    constructor(dbPath = "data/config.json") { 
        this.dbPath = dbPath;
        this.worker = null;
        this._spacelessMajorMap = null; 
    }

    async init() {
        try {
            const workerScript = `importScripts("https://cdn.jsdelivr.net/npm/sql.js-httpvfs@0.8.12/dist/sqlite.worker.js");`;
            const workerBlob = new Blob([workerScript], { type: "text/javascript" });
            const workerUrl = URL.createObjectURL(workerBlob);
            const wasmUrl = "https://cdn.jsdelivr.net/npm/sql.js-httpvfs@0.8.12/dist/sql-wasm.wasm";
            
            const cacheBuster = `?v=${Date.now()}`;
            // Base URL to the manifest file
            const manifestBaseUrl = new URL(this.dbPath, window.location.href);
            const configUrl = new URL(manifestBaseUrl.toString() + cacheBuster).toString();

            // 1. Fetch the exact byte math from Python's config.json
            const response = await fetch(configUrl);
            if (!response.ok) throw new Error(`Failed to load db config: ${response.statusText}`);
            const config = await response.json();

            // 2. Map the Python-generated 'chunks' array to the strict urlPrefix/suffixLength format 
            // required by the WebAssembly worker
            let urlPrefix = "schedules.db.";
            let suffixLength = 2;
            
            if (config.chunks && config.chunks.length > 0) {
                const firstChunk = config.chunks[0];
                const match = firstChunk.match(/^(.*)(\d{2})$/);
                if (match) {
                    urlPrefix = match[1];
                    suffixLength = match[2].length;
                }
            } else if (config.urlPrefix) {
                urlPrefix = config.urlPrefix;
                suffixLength = config.suffixLength || 2;
            }

            // Resolve the urlPrefix strictly relative to the config file (e.g., inside the data/ folder)
            const absoluteUrlPrefix = new URL(urlPrefix, manifestBaseUrl).toString();

            // 3. Hand the mathematically rigid config to WebAssembly
            const workerConfig = {
                from: "inline",
                config: {
                    serverMode: config.serverMode || "chunked",
                    requestChunkSize: config.requestChunkSize || 4096,
                    databaseLengthBytes: config.databaseLengthBytes,
                    serverChunkSize: config.serverChunkSize,
                    urlPrefix: absoluteUrlPrefix,
                    suffixLength: suffixLength
                }
            };

            this.worker = await createDbWorker(
                [workerConfig],
                workerUrl,
                wasmUrl
            );
            return true;
        } catch (error) {
            console.error("Database initialization failed:", error);
            throw error;
        }
    }

    async getUniqueMajors() {
        if (!this.worker) throw new Error("Database not initialized");
        
        const sql = `SELECT course_prefix, major_name FROM majors ORDER BY course_prefix ASC`;
        const rows = await this.worker.db.query(sql);
        
        return rows.map(r => {
            const prefix = r.course_prefix.trim();
            const spaceless = prefix.replace(/\s+/g, '');
            let name = r.major_name ? r.major_name.trim() : '';
            
            if (spaceless !== prefix) {
                name = name ? `${name} [${spaceless}]` : `[${spaceless}]`;
            }
            
            return { prefix, name };
        });
    }

    async _getSpacelessMajorMap() {
        if (this._spacelessMajorMap) return this._spacelessMajorMap;
        try {
            const majors = await this.getUniqueMajors();
            this._spacelessMajorMap = {};
            majors.forEach(m => {
                const official = m.prefix.toUpperCase();
                const spaceless = official.replace(/\s+/g, '');
                if (spaceless !== official) {
                    this._spacelessMajorMap[spaceless] = official; 
                }
            });
            return this._spacelessMajorMap;
        } catch (e) {
            return {};
        }
    }

    _getDaysMask(daysList) {
        let mask = 0;
        const map = {'M': 1, 'T': 2, 'W': 4, 'Th': 8, 'F': 16, 'S': 32, 'Su': 64};
        daysList.forEach(d => { if (map[d]) mask |= map[d]; });
        return mask;
    }

    _getAttributesMask(attributesList) {
        let mask = 0;
        const map = {
            'W': 1, 'H': 2, 'J': 4, 'O': 8, 'A': 16, 'B': 32, 'E': 64, 'S': 128,
            'R': 256, '%': 512, '#': 1024, 'Restricted': 2048, 'Add Code': 4096, 'CR/NC': 8192
        };
        attributesList.forEach(a => { if (map[a]) mask |= map[a]; });
        return mask;
    }

    _sanitizeFts(term, majorMap = {}) {
        let clean = term.replace(/['"*:^()\[\]{}]/g, ' ').trim().toUpperCase();
        if (!clean) return "";
        
        clean = clean.replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/(\d)([a-zA-Z])/g, '$1 $2');
        
        const tokens = clean.split(/\s+/);
        const queryParts = tokens.map(word => {
            if (majorMap[word]) {
                return `("${word}"* OR "${majorMap[word]}")`;
            }
            if (/^\d+$/.test(word)) {
                return `"${word}"`; 
            }
            return `"${word}"*`;
        });
        
        return queryParts.join(' AND ');
    }

    async searchCourses(searchTerm, filters = {}, limit = 25) {
        if (!this.worker) throw new Error("Database not initialized");

        const {
            majors = [],
            attributes = [],
            daysInclude = [],
            daysExclude = [],
            quarters = [], 
            tbaMode = "include",
            levels = [],
            sectionTypes = [],
            minCredits = "",
            maxCredits = "",
            minTermCode = null,
            maxTermCode = null,
            timeScope = "primary",
            startTime = "",
            endTime = "",
            sortBy = 'newest'
        } = filters;

        const majorMap = await this._getSpacelessMajorMap();

        let baseWhere = ["1=1"];
        let exceptWhere = [];

        const ftsTerm = this._sanitizeFts(searchTerm, majorMap);
        if (ftsTerm) {
            baseWhere.push(`course_id IN (SELECT course_id FROM omni_search WHERE search_text MATCH '${ftsTerm}')`);
        }

        if (majors.length > 0) {
            const majorList = majors.map(m => `'${m}'`).join(', ');
            baseWhere.push(`course_prefix IN (${majorList})`);
        }

        if (levels.length > 0) {
            const levelConds = levels.map(lvl => {
                if (lvl === '800') return `course_number >= 800`;
                const lower = parseInt(lvl);
                return `(course_number >= ${lower} AND course_number <= ${lower + 99})`;
            });
            baseWhere.push(`(${levelConds.join(' OR ')})`);
        }

        if (minTermCode) baseWhere.push(`term_code >= ${minTermCode}`);
        if (maxTermCode) baseWhere.push(`term_code <= ${maxTermCode}`);

        if (quarters.length > 0) {
            const qMap = { 'WIN': 1, 'SPR': 2, 'SUM': 3, 'AUT': 4 };
            const qNums = quarters.map(q => qMap[q]).filter(n => n);
            if (qNums.length > 0) {
                baseWhere.push(`(term_code % 10) IN (${qNums.join(',')})`);
            }
        }

        if (sectionTypes.length > 0) {
            const safeTypes = sectionTypes.map(t => `'${t.replace(/'/g, '')}'`).join(', ');
            baseWhere.push(`section_type IN (${safeTypes})`);
        }
        if (minCredits !== "") baseWhere.push(`credits_min >= ${parseFloat(minCredits)}`);
        if (maxCredits !== "") baseWhere.push(`credits_max <= ${parseFloat(maxCredits)}`);

        if (daysInclude.length > 0) {
            const incMask = this._getDaysMask(daysInclude);
            baseWhere.push(`(days_mask & ${incMask}) = ${incMask}`);
        }
        
        const attrMask = this._getAttributesMask(attributes);
        if (attrMask > 0) {
            baseWhere.push(`(attributes_mask & ${attrMask}) = ${attrMask}`);
        }

        let timeScopeCond = timeScope === 'primary' ? "is_primary = 1 AND " : "";

        if (tbaMode === 'exclude') {
            exceptWhere.push(`${timeScopeCond}is_tba = 1`);
        }
        
        if (daysExclude.length > 0) {
            const excMask = this._getDaysMask(daysExclude);
            exceptWhere.push(`${timeScopeCond}(days_mask & ${excMask}) > 0`);
        }

        if (startTime !== "") {
            exceptWhere.push(`${timeScopeCond}(is_tba = 0 AND start_time < ${parseInt(startTime.replace(':', ''))})`);
        }
        if (endTime !== "") {
            exceptWhere.push(`${timeScopeCond}(is_tba = 0 AND end_time > ${parseInt(endTime.replace(':', ''))})`);
        }

        if (attributes.includes('No Extra Fees')) {
            exceptWhere.push(`${timeScopeCond}fee > 0`);
        }

        let orderClause = "ORDER BY term_code DESC, course_prefix ASC, course_number ASC";
        if (sortBy === 'oldest') orderClause = "ORDER BY term_code ASC, course_prefix ASC, course_number ASC";
        if (sortBy === 'course') orderClause = "ORDER BY course_prefix ASC, course_number ASC, term_code DESC";

        let sieveSql = `
            SELECT DISTINCT course_id, term_code, course_prefix, course_number 
            FROM filter_discovery 
            WHERE ${baseWhere.join(' AND ')}
        `;

        if (exceptWhere.length > 0) {
            sieveSql += ` 
                EXCEPT 
                SELECT course_id, term_code, course_prefix, course_number 
                FROM filter_discovery 
                WHERE (${exceptWhere.join(') OR (')})
            `;
        }
        sieveSql += ` ${orderClause}`;

        const sieveRows = await this.worker.db.query(sieveSql);
        const finalIds = sieveRows.map(row => row.course_id);

        let pageIds = [];
        if (limit === 'all' || limit < 0) {
            pageIds = finalIds;
        } else {
            pageIds = finalIds.slice(0, limit);
        }
        
        const structuredResults = await this.hydrateCourses(pageIds, sortBy);
        
        structuredResults.totalMatches = finalIds.length;
        structuredResults.allIds = finalIds;
        
        return structuredResults;
    }

    async hydrateCourses(idArray, sortBy = 'newest') {
        if (!idArray || idArray.length === 0) return [];
        if (!this.worker) throw new Error("Database not initialized");

        let orderClause = "ORDER BY term_code DESC, course_prefix ASC, course_number ASC";
        if (sortBy === 'oldest') orderClause = "ORDER BY term_code ASC, course_prefix ASC, course_number ASC";
        if (sortBy === 'course') orderClause = "ORDER BY course_prefix ASC, course_number ASC, term_code DESC";

        const idList = idArray.map(id => `'${id}'`).join(',');
        
        const hydrateSql = `
            SELECT 
                c.course_id, c.course_prefix, c.course_number, c.course_title, c.quarter, c.year, c.notes as course_notes,
                s.section_id, s.is_primary, s.sln, s.section_type, s.credits_min, s.credits_max,
                s.enrolled, s.enrollment_limit, s.notes as section_notes, s.restricted_registration,
                s.add_code_required, s.is_credit_no_credit, s.fee,
                s.writing, s.honors, s.jointly_offered, s.online, s.asynchronous, s.hybrid,
                s.community_engaged, s.service_learning, s.research, s.new_course, s.no_financial_aid,
                m.meeting_id, m.days, m.start_time, m.end_time, m.building_room, m.instructor
            FROM courses c
            LEFT JOIN sections s ON c.course_id = s.course_id
            LEFT JOIN meetings m ON s.section_id = m.section_id
            WHERE c.course_id IN (${idList})
            ${orderClause}, s.section_id ASC, m.meeting_id ASC
        `;

        const hydrateRows = await this.worker.db.query(hydrateSql);
        return this._shapeDataForUI(hydrateRows);
    }

    _shapeDataForUI(rows) {
        const coursesMap = new Map();

        for (const row of rows) {
            if (!coursesMap.has(row.course_id)) {
                coursesMap.set(row.course_id, {
                    prefix: row.course_prefix,
                    number: row.course_number,
                    title: row.course_title || "Unknown Title",
                    quarter: `${row.quarter} ${row.year}`,
                    notes: row.course_notes,
                    sectionsMap: new Map()
                });
            }
            const course = coursesMap.get(row.course_id);

            if (row.section_id && !course.sectionsMap.has(row.section_id)) {
                const displayId = row.section_id.split('-').pop();

                let credStr = "";
                if (row.credits_min !== null) {
                    credStr = row.credits_min === row.credits_max ? `${row.credits_min}` : `${row.credits_min}-${row.credits_max}`;
                }

                const otherArgs = [];
                if (row.writing === 1) otherArgs.push('W');
                if (row.honors === 1) otherArgs.push('H');
                if (row.jointly_offered === 1) otherArgs.push('J');
                if (row.online === 1) otherArgs.push('O');
                if (row.asynchronous === 1) otherArgs.push('A');
                if (row.hybrid === 1) otherArgs.push('B');
                if (row.community_engaged === 1) otherArgs.push('E');
                if (row.service_learning === 1) otherArgs.push('S');
                if (row.research === 1) otherArgs.push('R');
                if (row.new_course === 1) otherArgs.push('%');
                if (row.no_financial_aid === 1) otherArgs.push('#');

                course.sectionsMap.set(row.section_id, {
                    sln: row.sln ? row.sln.toString() : 'N/A',
                    id: displayId,
                    isPrimary: row.is_primary === 1,
                    type: row.section_type || 'N/A',
                    cred: credStr,
                    enrl: row.enrolled !== null ? row.enrolled : '-',
                    limit: row.enrollment_limit !== null ? row.enrollment_limit : '-',
                    notes: row.section_notes,
                    restr: row.restricted_registration === 1,
                    addCode: row.add_code_required === 1,
                    crnc: row.is_credit_no_credit === 1,
                    fee: row.fee, 
                    other: otherArgs,
                    meetingsMap: new Map()
                });
            }

            if (row.meeting_id) {
                const section = course.sectionsMap.get(row.section_id);
                if (!section.meetingsMap.has(row.meeting_id)) {
                    let timeStr = "";
                    
                    const formatTime = (t) => {
                        if (!t) return "";
                        const str = t.toString();
                        if (str.includes(':')) return str;
                        return str.replace(/(\d{2})$/, ':$1');
                    };
                    
                    if (row.start_time && row.end_time) {
                        timeStr = `${formatTime(row.start_time)}-${formatTime(row.end_time)}`;
                    } else if (row.start_time) {
                        timeStr = formatTime(row.start_time);
                    }
                    
                    section.meetingsMap.set(row.meeting_id, {
                        days: row.days || 'TBA',
                        time: timeStr || '-',
                        bldg: row.building_room || 'TBA',
                        instructor: row.instructor || '-'
                    });
                }
            }
        }

        return Array.from(coursesMap.values()).map(c => ({
            ...c,
            sections: Array.from(c.sectionsMap.values()).map(s => ({
                ...s,
                meetings: Array.from(s.meetingsMap.values())
            }))
        }));
    }
}