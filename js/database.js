import * as sqljsHttpVfs from "https://esm.sh/sql.js-httpvfs@0.8.12?bundle";
import { getDaysMask, getAttributesMask, getTermCode, sanitizeFts } from './utils.js';
import { QUARTER_MAP } from './constants.js';

const createDbWorker = sqljsHttpVfs.createDbWorker || (sqljsHttpVfs.default && sqljsHttpVfs.default.createDbWorker);

export class DatabaseManager {
    constructor(dbPath = "data/config.json") { 
        this.dbPath = dbPath;
        this.worker = null;
        this._spacelessMajorMap = null; 
        
        // DEBUG ONLY !
        this.debugMode = true; 
    }

    async init() {
        try {
            const workerScript = `importScripts("https://cdn.jsdelivr.net/npm/sql.js-httpvfs@0.8.12/dist/sqlite.worker.js");`;
            const workerBlob = new Blob([workerScript], { type: "text/javascript" });
            const workerUrl = URL.createObjectURL(workerBlob);
            const wasmUrl = "https://cdn.jsdelivr.net/npm/sql.js-httpvfs@0.8.12/dist/sql-wasm.wasm";
            
            const manifestBaseUrl = new URL(this.dbPath, window.location.href);
            const response = await fetch(new URL(manifestBaseUrl.toString() + `?v=${Date.now()}`).toString());
            if (!response.ok) throw new Error(`Failed to load db config: ${response.statusText}`);
            
            const config = await response.json();
            let urlPrefix = "schedules.db.";
            let suffixLength = 2;
            
            if (config.chunks && config.chunks.length > 0) {
                const match = config.chunks[0].match(/^(.*)(\d{2})$/);
                if (match) { urlPrefix = match[1]; suffixLength = match[2].length; }
            } else if (config.urlPrefix) {
                urlPrefix = config.urlPrefix;
                suffixLength = config.suffixLength || 2;
            }

            const workerConfig = {
                from: "inline",
                config: {
                    serverMode: config.serverMode || "chunked",
                    requestChunkSize: config.requestChunkSize || 4096,
                    databaseLengthBytes: config.databaseLengthBytes,
                    serverChunkSize: config.serverChunkSize,
                    urlPrefix: new URL(urlPrefix, manifestBaseUrl).toString(),
                    suffixLength: suffixLength
                }
            };

            this.worker = await createDbWorker([workerConfig], workerUrl, wasmUrl);
            return true;
        } catch (error) {
            console.error("Database initialization failed:", error);
            throw error;
        }
    }

    // --- DEBUG PROFILER ---
    async _debugQueryPlan(sql, queryName = "Query") {
        if (!this.debugMode || !this.worker) return;
        try {
            const explainSql = `EXPLAIN QUERY PLAN ${sql}`;
            const planRows = await this.worker.db.query(explainSql);
            
            console.groupCollapsed(`%c [SQL Profiler] ${queryName}`, 'color: #7e22ce; font-weight: bold;');
            console.log(`%cExecuting SQL:\n${sql}`, 'color: gray;');
            console.table(planRows);
            console.groupEnd();
        } catch (e) {
            console.warn("Could not explain query plan:", e);
        }
    }

    async getUniqueMajors() {
        if (!this.worker) throw new Error("Database not initialized");
        const sql = `SELECT course_prefix, major_name FROM majors ORDER BY course_prefix ASC`;
        
        await this._debugQueryPlan(sql, "Fetch Unique Majors");
        
        const rows = await this.worker.db.query(sql);
        return rows.map(r => {
            const prefix = r.course_prefix.trim();
            const spaceless = prefix.replace(/\s+/g, '');
            let name = r.major_name ? r.major_name.trim() : '';
            if (spaceless !== prefix) name = name ? `${name} [${spaceless}]` : `[${spaceless}]`;
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
                if (spaceless !== official) this._spacelessMajorMap[spaceless] = official; 
            });
            return this._spacelessMajorMap;
        } catch (e) { return {}; }
    }

    _buildBaseWhereClause(filters, ftsTerm) {
        let baseWhere = ["1=1"];
        if (ftsTerm) baseWhere.push(`course_id IN (SELECT course_id FROM omni_search WHERE search_text MATCH '${ftsTerm}')`);
        if (filters.majors.length > 0) baseWhere.push(`course_prefix IN (${filters.majors.map(m => `'${m}'`).join(', ')})`);
        
        if (filters.levels.length > 0) {
            const levelConds = filters.levels.map(lvl => {
                if (lvl === '800') return `course_number >= 800`;
                const lower = parseInt(lvl);
                return `(course_number >= ${lower} AND course_number <= ${lower + 99})`;
            });
            baseWhere.push(`(${levelConds.join(' OR ')})`);
        }

        const minTerm = getTermCode(filters.startYear, filters.startQuarter, true);
        const maxTerm = getTermCode(filters.endYear, filters.endQuarter, false);
        if (minTerm) baseWhere.push(`term_code >= ${minTerm}`);
        if (maxTerm) baseWhere.push(`term_code <= ${maxTerm}`);

        if (filters.quarters.length > 0) {
            const qNums = filters.quarters.map(q => QUARTER_MAP[q]).filter(Boolean);
            if (qNums.length > 0) baseWhere.push(`(term_code % 10) IN (${qNums.join(',')})`);
        }

        if (filters.sectionTypes.length > 0) {
            const safeTypes = filters.sectionTypes.map(t => `'${t.replace(/'/g, '')}'`).join(', ');
            baseWhere.push(`section_type IN (${safeTypes})`);
        }

        if (filters.minCredits !== "") baseWhere.push(`credits_min >= ${parseFloat(filters.minCredits)}`);
        if (filters.maxCredits !== "") baseWhere.push(`credits_max <= ${parseFloat(filters.maxCredits)}`);

        if (filters.daysInclude.length > 0) {
            const incMask = getDaysMask(filters.daysInclude);
            baseWhere.push(`(days_mask & ${incMask}) = ${incMask}`);
        }
        
        const attrMask = getAttributesMask(filters.attributes);
        if (attrMask > 0) baseWhere.push(`(attributes_mask & ${attrMask}) = ${attrMask}`);

        return baseWhere;
    }

    _buildExceptWhereClause(filters) {
        let exceptWhere = [];
        const timeScopeCond = filters.timeScope === 'primary' ? "is_primary = 1 AND " : "";

        if (filters.tbaMode === 'exclude') exceptWhere.push(`${timeScopeCond}is_tba = 1`);
        
        if (filters.daysExclude.length > 0) {
            const excMask = getDaysMask(filters.daysExclude);
            exceptWhere.push(`${timeScopeCond}(days_mask & ${excMask}) > 0`);
        }

        if (filters.startTime !== "") exceptWhere.push(`${timeScopeCond}(is_tba = 0 AND start_time < ${parseInt(filters.startTime.replace(':', ''))})`);
        if (filters.endTime !== "") exceptWhere.push(`${timeScopeCond}(is_tba = 0 AND end_time > ${parseInt(filters.endTime.replace(':', ''))})`);

        if (filters.attributes.includes('No Extra Fees')) exceptWhere.push(`${timeScopeCond}fee > 0`);

        return exceptWhere;
    }

    async searchCourses(filters = {}, limit = 25, signal) {
        if (!this.worker) throw new Error("Database not initialized");
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        const majorMap = await this._getSpacelessMajorMap();
        const ftsTerm = sanitizeFts(filters.query, majorMap);

        const baseWhere = this._buildBaseWhereClause(filters, ftsTerm);
        const exceptWhere = this._buildExceptWhereClause(filters);

        let orderClause = "ORDER BY term_code DESC, course_prefix ASC, course_number ASC";
        if (filters.sortBy === 'oldest') orderClause = "ORDER BY term_code ASC, course_prefix ASC, course_number ASC";
        if (filters.sortBy === 'course') orderClause = "ORDER BY course_prefix ASC, course_number ASC, term_code DESC";

        let sieveSql = `SELECT DISTINCT course_id, term_code, course_prefix, course_number FROM filter_discovery WHERE ${baseWhere.join(' AND ')}`;
        if (exceptWhere.length > 0) {
            sieveSql += ` EXCEPT SELECT course_id, term_code, course_prefix, course_number FROM filter_discovery WHERE (${exceptWhere.join(') OR (')})`;
        }
        sieveSql += ` ${orderClause}`;

        // Log the Sieve Query Plan
        await this._debugQueryPlan(sieveSql, "Discovery Sieve Query");

        const sieveRows = await this.worker.db.query(sieveSql);
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        const finalIds = sieveRows.map(row => row.course_id);
        const pageIds = (limit === 'all' || limit < 0) ? finalIds : finalIds.slice(0, limit);
        
        const hydratedRows = await this.hydrateCourses(pageIds, filters.sortBy, signal);
        
        return {
            rows: hydratedRows,
            totalMatches: finalIds.length,
            allIds: finalIds
        };
    }

    async hydrateCourses(idArray, sortBy = 'newest', signal) {
        if (!idArray || idArray.length === 0) return [];
        if (!this.worker) throw new Error("Database not initialized");
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

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

        // Log the Hydration Query Plan
        await this._debugQueryPlan(hydrateSql, "Data Hydration Query");

        const hydrateRows = await this.worker.db.query(hydrateSql);
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        
        return hydrateRows;
    }
}