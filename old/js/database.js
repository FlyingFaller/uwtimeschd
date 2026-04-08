// Import directly from our locally downloaded file!
import { createDbWorker } from "./lib/index.js";

// Uses WebAssembly to read the SQLite header and execute queries using Range Requests
export async function initDatabase(dbUrl) {
    
    // Point the Web Worker and WebAssembly to our local files
    const workerUrl = "js/lib/sqlite.worker.js";
    const wasmUrl = "js/lib/sql-wasm.wasm";

    const worker = await createDbWorker(
        [{
            from: "inline",
            config: {
                serverMode: "full",
                url: dbUrl,
                requestChunkSize: 4096, // Fetches the DB in 4KB chunks as needed
            }
        }],
        workerUrl,
        wasmUrl
    );
    
    return worker.db;
}

// Dynamically queries the DB for all unique major names for the sidebar
export async function getUniqueMajors(db) {
    const results = await db.query("SELECT DISTINCT major_name FROM courses ORDER BY major_name ASC");
    return results.map(row => row.major_name).filter(m => m);
}

// The heavy lifting: Converting UI filters to a massive SQLite query
export async function executeSearch(db, filters) {
    
    // ==========================================
    // STEP 1: Find matched Course IDs
    // We use a subquery to find courses that have AT LEAST ONE section/meeting matching the criteria.
    // ==========================================
    
    let baseWhere = ["1=1"];
    let params = [];

    // --- Text Search ---
    if (filters.query) {
        const q = `%${filters.query}%`;
        const strippedQ = filters.query.replace(/\s+/g, '');
        baseWhere.push(`(
            REPLACE(c.course_prefix || c.course_number, ' ', '') LIKE ? 
            OR c.course_title LIKE ? 
            OR s.sln LIKE ? 
            OR m.instructor LIKE ? 
            OR m.building_room LIKE ?
        )`);
        params.push(`%${strippedQ}%`, q, q, q, q);
    }

    // --- Majors (Department) ---
    if (!filters.majors.includes('ALL') && filters.majors.length > 0) {
        const placeholders = filters.majors.map(() => '?').join(',');
        baseWhere.push(`c.major_name IN (${placeholders})`); 
        params.push(...filters.majors);
    }

    // --- Levels ---
    if (filters.levels.length > 0) {
        let levelConditions = [];
        filters.levels.forEach(lvl => {
            let num = parseInt(lvl);
            if (num === 500) {
                levelConditions.push(`c.course_number >= 500`);
            } else {
                levelConditions.push(`(c.course_number >= ? AND c.course_number < ?)`);
                params.push(num, num + 100);
            }
        });
        baseWhere.push(`(${levelConditions.join(' OR ')})`);
    }

    // --- Credits ---
    if (filters.credMin !== null) { baseWhere.push(`s.credits_min >= ?`); params.push(filters.credMin); }
    if (filters.credMax !== null) { baseWhere.push(`s.credits_max <= ?`); params.push(filters.credMax); }

    // --- Types ---
    if (filters.types.length > 0) {
        const placeholders = filters.types.map(() => '?').join(',');
        baseWhere.push(`s.section_type IN (${placeholders})`);
        params.push(...filters.types);
    }

    // --- Attributes ---
    if (filters.attrs.includes('restr')) baseWhere.push(`s.restricted_registration = 1`);
    if (filters.attrs.includes('addCode')) baseWhere.push(`s.add_code_required = 1`);
    if (filters.attrs.includes('crnc')) baseWhere.push(`s.is_credit_no_credit = 1`);
    if (filters.attrs.includes('noFee')) baseWhere.push(`s.fee IS NULL`);
    
    // Map UI attr keys to DB columns
    const attrColMap = {
        'W': 'writing', 'H': 'honors', 'J': 'jointly_offered', 'pct': 'new_course',
        'O': 'online', 'A': 'asynchronous', 'B': 'hybrid', 'E': 'community_engaged',
        'S': 'service_learning', 'R': 'research', 'noFinAid': 'no_financial_aid'
    };
    filters.attrs.forEach(attr => {
        if (attrColMap[attr]) baseWhere.push(`s.${attrColMap[attr]} = 1`);
    });

    // --- Time & Schedule ---
    let scopePrefix = filters.timeScope === 'primary' ? `s.is_primary = 1 AND ` : "";

    if (filters.days.length > 0) {
        let dayConditions = filters.days.map(d => `m.days LIKE '%${d}%'`);
        if (filters.dayMode === 'include') {
            baseWhere.push(`(${scopePrefix} (${dayConditions.join(' OR ')}))`);
        } else {
            baseWhere.push(`(${scopePrefix} NOT (${dayConditions.join(' OR ')}))`);
        }
    }

    if (filters.timeStart) {
        baseWhere.push(`(${scopePrefix} m.start_time >= ?)`);
        params.push(filters.timeStart.replace(':', '')); 
    }
    if (filters.timeEnd) {
        baseWhere.push(`(${scopePrefix} m.end_time <= ?)`);
        params.push(filters.timeEnd.replace(':', ''));
    }

    const filterSql = `
        SELECT DISTINCT c.course_id 
        FROM courses c 
        LEFT JOIN sections s ON c.course_id = s.course_id 
        LEFT JOIN meetings m ON s.section_id = m.section_id 
        WHERE ${baseWhere.join(' AND ')}
        LIMIT 100 -- Hard limit to prevent massive DOM lag
    `;
    
    // Execute to get IDs
    const idResults = await db.query(filterSql, params);
    if (idResults.length === 0) return [];
    
    const matchedCourseIds = idResults.map(r => r.course_id);
    const idPlaceholders = matchedCourseIds.map(() => '?').join(',');

    // ==========================================
    // STEP 2: Fetch the complete hierarchy for those IDs
    // ==========================================
    
    let orderClause = "ORDER BY c.course_prefix ASC, c.course_number ASC, s.section_id ASC";
    if (filters.sort === 'za') {
        orderClause = "ORDER BY c.course_prefix DESC, c.course_number DESC, s.section_id ASC";
    }
    
    const fullDataSql = `
        SELECT 
            c.course_id, c.year, c.quarter, c.course_prefix, c.course_number, c.course_title, c.notes as course_notes,
            s.section_id, s.is_primary, s.sln, s.section_type, s.credits_min, s.credits_max, s.enrolled, s.enrollment_limit,
            s.status, s.is_credit_no_credit, s.fee, s.notes as sec_notes, s.restricted_registration, s.add_code_required,
            s.writing, s.honors, s.jointly_offered, s.new_course, s.online, s.asynchronous, s.hybrid, s.community_engaged, 
            s.service_learning, s.research, s.no_financial_aid,
            m.meeting_id, m.days, m.start_time, m.end_time, m.building_room, m.instructor
        FROM courses c
        LEFT JOIN sections s ON c.course_id = s.course_id
        LEFT JOIN meetings m ON s.section_id = m.section_id
        WHERE c.course_id IN (${idPlaceholders})
        ${orderClause}
    `;

    const rawRows = await db.query(fullDataSql, matchedCourseIds);
    
    // ==========================================
    // STEP 3: Restructure flat rows into hierarchical JS Objects
    // ==========================================
    const courseMap = new Map();

    rawRows.forEach(row => {
        if (!courseMap.has(row.course_id)) {
            courseMap.set(row.course_id, {
                id: row.course_id,
                prefix: row.course_prefix,
                number: row.course_number,
                title: row.course_title,
                quarter: `${row.quarter} ${row.year}`,
                notes: row.course_notes,
                sectionsMap: new Map()
            });
        }
        
        let course = courseMap.get(row.course_id);

        if (row.section_id) {
            if (!course.sectionsMap.has(row.section_id)) {
                
                let cred = "";
                if (row.credits_min !== null) {
                    cred = row.credits_min === row.credits_max ? `${row.credits_min}` : `${row.credits_min}-${row.credits_max}`;
                }
                
                let otherCodes = [];
                if (row.writing) otherCodes.push('W');
                if (row.honors) otherCodes.push('H');
                if (row.jointly_offered) otherCodes.push('J');
                if (row.online) otherCodes.push('O');
                if (row.asynchronous) otherCodes.push('A');
                if (row.hybrid) otherCodes.push('B');
                if (row.community_engaged) otherCodes.push('E');
                if (row.service_learning) otherCodes.push('S');
                if (row.research) otherCodes.push('R');
                if (row.new_course) otherCodes.push('%');
                if (row.no_financial_aid) otherCodes.push('#');

                let shortId = row.section_id.split('-').pop();

                course.sectionsMap.set(row.section_id, {
                    sln: row.sln ? row.sln.toString() : '-',
                    id: shortId,
                    isPrimary: Boolean(row.is_primary),
                    type: row.section_type || 'LC',
                    cred: cred,
                    enrl: row.enrolled !== null ? row.enrolled : '-',
                    limit: row.enrollment_limit !== null ? row.enrollment_limit : '-',
                    notes: row.sec_notes,
                    restr: Boolean(row.restricted_registration),
                    addCode: Boolean(row.add_code_required),
                    crnc: Boolean(row.is_credit_no_credit),
                    fee: row.fee,
                    other: otherCodes,
                    meetings: []
                });
            }

            if (row.meeting_id) {
                let sec = course.sectionsMap.get(row.section_id);
                let formatTime = (t) => t && t.length >= 3 ? t.slice(0,-2) + ":" + t.slice(-2) : t;
                let timeStr = row.start_time ? `${formatTime(row.start_time)}-${formatTime(row.end_time)}` : '';
                
                sec.meetings.push({
                    days: row.days || 'TBA',
                    time: timeStr,
                    bldg: row.building_room || 'TBA',
                    instructor: row.instructor || 'Staff'
                });
            }
        }
    });

    return Array.from(courseMap.values()).map(c => {
        c.sections = Array.from(c.sectionsMap.values());
        delete c.sectionsMap; 
        return c;
    });
}