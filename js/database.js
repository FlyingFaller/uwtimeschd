import * as sqljsHttpVfs from "https://esm.sh/sql.js-httpvfs@0.8.12?bundle";
const createDbWorker = sqljsHttpVfs.createDbWorker || (sqljsHttpVfs.default && sqljsHttpVfs.default.createDbWorker);

export class DatabaseManager {
    constructor(dbPath = "data/schedules.db") {
        this.dbPath = dbPath;
        this.worker = null;
    }

    async init() {
        try {
            const workerScript = `importScripts("https://cdn.jsdelivr.net/npm/sql.js-httpvfs@0.8.12/dist/sqlite.worker.js");`;
            const workerBlob = new Blob([workerScript], { type: "text/javascript" });
            const workerUrl = URL.createObjectURL(workerBlob);
            const wasmUrl = "https://cdn.jsdelivr.net/npm/sql.js-httpvfs@0.8.12/dist/sql-wasm.wasm";
            
            const cacheBuster = `?v=${Date.now()}`;
            const absoluteDbUrl = new URL(this.dbPath + cacheBuster, window.location.href).toString();

            this.worker = await createDbWorker(
                [{
                    from: "inline",
                    config: {
                        serverMode: "full",
                        url: absoluteDbUrl,
                        requestChunkSize: 4096, 
                    },
                }],
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
        
        try {
            const sql = `SELECT course_prefix, major_name FROM majors ORDER BY course_prefix ASC`;
            const rows = await this.worker.db.query(sql);
            return rows.map(r => ({ 
                prefix: r.course_prefix.trim(),
                name: r.major_name ? r.major_name.trim() : ''
            }));
        } catch (err) {
            console.warn("Dedicated 'majors' table not found. Falling back to Full Table Scan of 'courses'.");
            const fallbackSql = `SELECT DISTINCT course_prefix, major_name FROM courses WHERE course_prefix IS NOT NULL AND course_prefix != '' ORDER BY course_prefix ASC`;
            const rows = await this.worker.db.query(fallbackSql);
            return rows.map(r => ({ prefix: r.course_prefix.trim(), name: r.major_name ? r.major_name.trim() : '' }));
        }
    }

    async searchCourses(searchTerm, filters = {}) {
        if (!this.worker) throw new Error("Database not initialized");

        const safeTerm = searchTerm.replace(/'/g, "''").toUpperCase();

        const {
            majors = [],
            attributes = [],
            daysInclude = [],
            daysExclude = [],
            tbaMode = "include",
            levels = [],
            sectionTypes = [],
            minCredits = "",
            maxCredits = "",
            timeScope = "all",
            startTime = "",
            endTime = "",
            sortBy = 'newest'
        } = filters;

        let whereClauses = [];

        // 1. Text Search
        if (safeTerm) {
            whereClauses.push(`(
                c.course_prefix LIKE '%${safeTerm}%' 
                OR c.course_number LIKE '%${safeTerm}%' 
                OR c.course_title LIKE '%${safeTerm}%'
                OR s.sln LIKE '%${safeTerm}%'
                OR m.instructor LIKE '%${safeTerm}%'
            )`);
        }

        // 2. Majors / Departments Filter
        if (majors.length > 0) {
            const majorList = majors.map(m => `'${m}'`).join(', ');
            whereClauses.push(`c.course_prefix IN (${majorList})`);
        }

        // 3. Course Levels
        if (levels.length > 0) {
            const levelConds = levels.map(lvl => {
                if (lvl === '800') return `c.course_number >= 800`;
                const lower = parseInt(lvl);
                const upper = lower + 99;
                return `(c.course_number >= ${lower} AND c.course_number <= ${upper})`;
            });
            whereClauses.push(`(${levelConds.join(' OR ')})`);
        }

        // 4. Credits Min / Max
        if (minCredits !== "") {
            whereClauses.push(`s.credits_min >= ${parseFloat(minCredits)}`);
        }
        if (maxCredits !== "") {
            whereClauses.push(`s.credits_max <= ${parseFloat(maxCredits)}`);
        }

        // 5. Section Types
        if (sectionTypes.length > 0) {
            const safeTypes = sectionTypes.map(t => `'${t.replace(/'/g, '')}'`).join(', ');
            whereClauses.push(`s.section_type IN (${safeTypes})`);
        }

        // 6. Attributes & Grading (STRICT INTEGER LOOKUPS)
        const attrMap = {
            'W': "s.writing = 1",
            'H': "s.honors = 1",
            'J': "s.jointly_offered = 1",
            'O': "s.online = 1",
            'A': "s.asynchronous = 1",
            'B': "s.hybrid = 1",
            'E': "s.community_engaged = 1",
            'S': "s.service_learning = 1",
            'R': "s.research = 1",
            '%': "s.new_course = 1",
            '#': "s.no_financial_aid = 1",
            'Restricted': "s.restricted_registration = 1",
            'Add Code': "s.add_code_required = 1",
            'CR/NC': "s.is_credit_no_credit = 1"
        };
        for (const attr of attributes) {
            if (attrMap[attr]) whereClauses.push(attrMap[attr]);
        }

        // 7 & 8. Negative EXCLUSIONS via EXCEPT clause
        let violatingClauses = [];

        // Strict Fee Exclusion: Uses the confirmed 'fee' integer column
        if (attributes.includes('No Extra Fees')) {
            violatingClauses.push(`(s.fee > 0)`);
        }

        // TBA Handling: Uses the confirmed 'is_tba' integer column
        if (tbaMode === 'exclude') {
            violatingClauses.push(`(m.is_tba = 1)`);
        }

        // Time Violations
        if (startTime !== "") {
            const minInt = parseInt(startTime.replace(':', ''));
            let cond = `(m.start_time < ${minInt})`;
            if (tbaMode === 'include') cond = `(m.is_tba = 0 AND ${cond})`;
            violatingClauses.push(cond);
        }
        if (endTime !== "") {
            const maxInt = parseInt(endTime.replace(':', ''));
            let cond = `(m.end_time > ${maxInt})`;
            if (tbaMode === 'include') cond = `(m.is_tba = 0 AND ${cond})`;
            violatingClauses.push(cond);
        }

        // Day Violations: Boolean column lookups
        if (daysInclude.length > 0) {
            const missingDaysConds = daysInclude.map(d => `m.meets_${d.toLowerCase()} = 0`);
            let cond = `(${missingDaysConds.join(' OR ')})`;
            if (tbaMode === 'include') cond = `(m.is_tba = 0 AND ${cond})`;
            violatingClauses.push(cond);
        }
        
        if (daysExclude.length > 0) {
            const presentDaysConds = daysExclude.map(d => `m.meets_${d.toLowerCase()} = 1`);
            let cond = `(${presentDaysConds.join(' OR ')})`;
            if (tbaMode === 'include') cond = `(m.is_tba = 0 AND ${cond})`;
            violatingClauses.push(cond);
        }

        // EXCEPT clause
        let exceptClause = "";
        if (violatingClauses.length > 0) {
            let scopeCondition = "1=1";
            if (timeScope === 'primary') {
                scopeCondition = "s.is_primary = 1";
            }
            
            // CRITICAL FIX: Combine the main search anchors (major, text, etc.) with the exclusion logic.
            // This prevents the EXCEPT query from performing a global table scan.
            const exceptWhereClauses = [
                ...whereClauses,
                `(${scopeCondition})`,
                `(${violatingClauses.join(' OR ')})`
            ];

            exceptClause = `
                EXCEPT
                SELECT c.course_id
                FROM courses c
                JOIN sections s ON c.course_id = s.course_id
                JOIN meetings m ON s.section_id = m.section_id
                WHERE ${exceptWhereClauses.join(' AND ')}
            `;
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : "";

        // CTE Sorting
        let orderByCTE = "ORDER BY c.course_prefix ASC, c.course_number ASC";
        if (sortBy === 'newest') {
            orderByCTE = "ORDER BY c.year DESC, CASE c.quarter WHEN 'AUT' THEN 4 WHEN 'SUM' THEN 3 WHEN 'SPR' THEN 2 WHEN 'WIN' THEN 1 ELSE 0 END DESC, c.course_prefix ASC, c.course_number ASC";
        } else if (sortBy === 'oldest') {
            orderByCTE = "ORDER BY c.year ASC, CASE c.quarter WHEN 'WIN' THEN 1 WHEN 'SPR' THEN 2 WHEN 'SUM' THEN 3 WHEN 'AUT' THEN 4 ELSE 5 END ASC, c.course_prefix ASC, c.course_number ASC";
        }

        const mainOrderBy = `${orderByCTE}, s.section_id ASC`;

        // Using SELECT DISTINCT c.course_id for the pool to avoid GROUP BY overhead
        const sql = `
            WITH MatchingCourses AS (
                SELECT DISTINCT c.course_id
                FROM courses c
                LEFT JOIN sections s ON c.course_id = s.course_id
                LEFT JOIN meetings m ON s.section_id = m.section_id
                ${whereString}
                ${exceptClause}
            )
            SELECT 
                c.course_id, c.course_prefix, c.course_number, c.course_title, c.quarter, c.year, c.notes as course_notes,
                s.section_id, s.is_primary, s.sln, s.section_type, s.credits_min, s.credits_max,
                s.enrolled, s.enrollment_limit, s.notes as section_notes, s.restricted_registration,
                s.add_code_required, s.is_credit_no_credit, s.fee,
                s.writing, s.honors, s.jointly_offered, s.online, s.asynchronous, s.hybrid,
                s.community_engaged, s.service_learning, s.research, s.new_course, s.no_financial_aid,
                m.meeting_id, m.days, m.start_time, m.end_time, m.building_room, m.instructor
            FROM courses c
            JOIN MatchingCourses mc ON c.course_id = mc.course_id
            LEFT JOIN sections s ON c.course_id = s.course_id
            LEFT JOIN meetings m ON s.section_id = m.section_id
            ${mainOrderBy}
        `;

        const rows = await this.worker.db.query(sql);
        return this._shapeDataForUI(rows);
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
                        days: row.days ? row.days.replace(/,/g, '') : 'TBA',
                        time: timeStr || '-',
                        bldg: row.building_room || 'TBA',
                        instructor: row.instructor || 'Staff'
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