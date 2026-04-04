// ==========================================
// 1. STATE & DOM ELEMENTS
// ==========================================
let db = null;
const DOM = {
    status: document.getElementById('status-text'),
    searchIn: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    sortSel: document.getElementById('sort-select'),
    results: document.getElementById('results-container'),
    toolbar: document.getElementById('toolbar'),
    
    // Filter DOM Elements
    filterStatus: document.getElementById('filter-status'),
    filterLevel: document.getElementById('filter-level'),
    filterCredits: document.getElementById('filter-credits'),
    filterType: document.getElementById('filter-type'),
    filterFee: document.getElementById('filter-fee'),
    filterPrereq: document.getElementById('filter-prereq'),
    filterCrnc: document.getElementById('filter-crnc'),
    dayFilters: document.querySelectorAll('.day-filter')
};

// ==========================================
// 2. INITIALIZATION
// ==========================================
async function loadDatabase() {
    try {
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        const response = await fetch('data/schedules.db');
        if (!response.ok) throw new Error("Could not find data/schedules.db");

        const buffer = await response.arrayBuffer();
        db = new SQL.Database(new Uint8Array(buffer));
        
        DOM.status.innerText = "Database loaded! Ready to search.";
        DOM.status.className = "text-green-600 mb-8 text-center font-semibold";
        DOM.searchIn.disabled = false;
        DOM.searchBtn.disabled = false;
        DOM.sortSel.disabled = false;

    } catch (error) {
        console.error(error);
        DOM.status.innerText = "Error: " + error.message;
        DOM.status.className = "text-red-600 mb-8 text-center font-semibold";
    }
}

// ==========================================
// 3. SEARCH & SQL EXECUTION
// ==========================================
function executeSearch() {
    if (!db) return;
    const query = DOM.searchIn.value.trim();
    if (query.length < 2) return;

    DOM.results.innerHTML = '<p class="text-center text-gray-500 py-8">Searching...</p>';
    DOM.toolbar.classList.add('hidden');

    setTimeout(() => {
        const safeQuery = `%${query}%`;
        const spacelessQuery = `%${query.replace(/\s+/g, '')}%`;
        
        // ------------------------------------------
        // A. Handle Sorting Logic
        // ------------------------------------------
        let orderByClause = "ORDER BY c.year DESC, CASE c.quarter WHEN 'WIN' THEN 1 WHEN 'SPR' THEN 2 WHEN 'SUM' THEN 3 WHEN 'AUT' THEN 4 END DESC, c.course_prefix, c.course_number";
        if (DOM.sortSel.value === 'oldest') {
            orderByClause = "ORDER BY c.year ASC, CASE c.quarter WHEN 'WIN' THEN 1 WHEN 'SPR' THEN 2 WHEN 'SUM' THEN 3 WHEN 'AUT' THEN 4 END ASC, c.course_prefix, c.course_number";
        } else if (DOM.sortSel.value === 'alpha') {
            orderByClause = "ORDER BY c.course_prefix ASC, c.course_number ASC, c.year DESC, CASE c.quarter WHEN 'WIN' THEN 1 WHEN 'SPR' THEN 2 WHEN 'SUM' THEN 3 WHEN 'AUT' THEN 4 END DESC";
        }

        // ------------------------------------------
        // B. Handle Advanced Filtering Logic
        // ------------------------------------------
        let filterConditions = "";

        // 1. Status Filter
        if (DOM.filterStatus.value === 'open') filterConditions += " AND s2.status = 'Open'";
        if (DOM.filterStatus.value === 'closed') filterConditions += " AND s2.status != 'Open'";

        // 2. Course Level Filter
        const levelVal = DOM.filterLevel.value;
        if (levelVal !== 'all') {
            const minLvl = parseInt(levelVal);
            if (minLvl === 500) {
                filterConditions += ` AND c2.course_number >= 500`;
            } else {
                filterConditions += ` AND c2.course_number >= ${minLvl} AND c2.course_number <= ${minLvl + 99}`;
            }
        }

        // 3. Credits Filter
        if (DOM.filterCredits.value === '1-2') filterConditions += " AND s2.credits_min >= 1 AND s2.credits_max <= 2";
        if (DOM.filterCredits.value === '3-4') filterConditions += " AND s2.credits_min >= 3 AND s2.credits_max <= 4";
        if (DOM.filterCredits.value === '5+') filterConditions += " AND s2.credits_min >= 5";

        // 4. Section Type Filter
        if (DOM.filterType.value === 'lec') filterConditions += " AND (s2.section_type IS NULL OR s2.section_type = 'LC')";
        if (DOM.filterType.value === 'qz') filterConditions += " AND s2.section_type = 'QZ'";
        if (DOM.filterType.value === 'lb') filterConditions += " AND s2.section_type = 'LB'";

        // 5. Fees Filter
        if (DOM.filterFee.value === 'no_fee') filterConditions += " AND (s2.fee IS NULL OR s2.fee = 0)";
        if (DOM.filterFee.value === 'has_fee') filterConditions += " AND s2.fee > 0";

        // 6. Prerequisites Filter
        if (DOM.filterPrereq.value === 'yes') filterConditions += " AND c2.has_prerequisites = 1";
        if (DOM.filterPrereq.value === 'no') filterConditions += " AND (c2.has_prerequisites = 0 OR c2.has_prerequisites IS NULL)";

        // 7. CR/NC Filter
        if (DOM.filterCrnc.value === 'crnc') filterConditions += " AND s2.is_credit_no_credit = 1";

        // 8. Meeting Days Filter
        const checkedDays = Array.from(DOM.dayFilters).filter(cb => cb.checked).map(cb => cb.value);
        if (checkedDays.length > 0) {
            const daySql = checkedDays.map(day => `(',' || m2.days || ',') LIKE '%,${day},%'`).join(" OR ");
            filterConditions += ` AND (${daySql})`;
        }
        
        // ------------------------------------------
        // C. Construct the Final Query
        // ------------------------------------------
        const sqlString = `
            SELECT 
                c.course_id, c.course_prefix, c.course_number, c.course_title, c.college, c.notes as course_notes, c.year, c.quarter,
                s.section_id, s.section_type, s.status, s.enrolled, s.enrollment_limit, s.sln, s.credits_min, s.credits_max, s.notes as section_notes, s.is_credit_no_credit, s.fee,
                m.meeting_id, m.days, m.start_time, m.end_time, m.building_room, m.instructor
            FROM courses c
            LEFT JOIN sections s ON c.course_id = s.course_id
            LEFT JOIN meetings m ON s.section_id = m.section_id
            WHERE c.course_id IN (
                SELECT DISTINCT c2.course_id 
                FROM courses c2
                LEFT JOIN sections s2 ON c2.course_id = s2.course_id
                LEFT JOIN meetings m2 ON s2.section_id = m2.section_id
                WHERE (
                    REPLACE(c2.course_prefix || c2.course_number, ' ', '') LIKE ? 
                    OR c2.course_title LIKE ? 
                    OR m2.instructor LIKE ?
                ) ${filterConditions}
            )
            ${orderByClause}, s.section_id;
        `;

        try {
            const stmt = db.prepare(sqlString);
            stmt.bind([spacelessQuery, safeQuery, safeQuery]);
            
            const coursesMap = new Map();
            while (stmt.step()) {
                const row = stmt.getAsObject();
                
                if (!coursesMap.has(row.course_id)) {
                    coursesMap.set(row.course_id, { ...row, sections: new Map() });
                }
                const course = coursesMap.get(row.course_id);
                
                if (row.section_id && !course.sections.has(row.section_id)) {
                    course.sections.set(row.section_id, { ...row, meetings: [] });
                }
                if (row.meeting_id) {
                    course.sections.get(row.section_id).meetings.push(row);
                }
            }
            stmt.free();

            const courseList = Array.from(coursesMap.values()).map(c => ({
                ...c,
                sections: Array.from(c.sections.values())
            }));

            renderResults(courseList);

        } catch (err) {
            console.error("Search error:", err);
            DOM.results.innerHTML = `<p class="text-center text-red-500 py-8">An error occurred while searching.</p>`;
        }
    }, 50);
}

// ==========================================
// 4. RENDERING & HTML GENERATION
// ==========================================
function renderResults(courseList) {
    if (courseList.length === 0) {
        DOM.results.innerHTML = `<p class="text-center text-gray-500 py-12 text-lg">No courses found matching your search and filters.</p>`;
        return;
    }

    DOM.toolbar.classList.remove('hidden');
    let html = "";

    courseList.forEach(course => {
        let sectionsHtml = "";
        course.sections.forEach(section => {
            let meetingsHtml = section.meetings.map(m => `
                <div class="grid grid-cols-3 gap-4 text-sm text-gray-700 mt-2">
                    <div>🕒 ${m.days || 'TBA'} ${m.start_time ? m.start_time + '-' + m.end_time : ''}</div>
                    <div>📍 ${m.building_room || 'TBA'}</div>
                    <div class="truncate" title="${m.instructor}">👨‍🏫 ${m.instructor || 'Staff'}</div>
                </div>
            `).join('');
            
            let creditsText = section.credits_min !== null ? 
                (section.credits_min === section.credits_max ? `${section.credits_min} CR` : `${section.credits_min}-${section.credits_max} CR`) : '';
            let feeText = section.fee ? `<span class="ml-2 text-red-600 font-bold">$${section.fee} Fee</span>` : '';
            let crncText = section.is_credit_no_credit ? `<span class="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded font-bold">CR/NC</span>` : '';

            sectionsHtml += `
                <div class="bg-white border border-gray-200 rounded-lg p-4 mb-3 shadow-sm">
                    <div class="flex flex-wrap justify-between items-center mb-2 pb-2 border-b border-gray-100 gap-2">
                        <div class="font-bold flex flex-wrap items-center gap-3">
                            <span>Section ${section.section_id.split('-').pop()}</span>
                            <span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">${section.section_type || 'LEC'}</span>
                            <span class="text-sm font-normal text-gray-500">SLN: ${section.sln}</span>
                            <span class="text-sm text-gray-600 font-medium ml-2">${creditsText}${feeText}${crncText}</span>
                        </div>
                        <div class="text-sm">
                            <span class="${section.status === 'Open' ? 'text-green-600' : 'text-red-600'} font-bold">${section.status || '?'}</span>
                            <span class="text-gray-500 ml-2">${section.enrolled} / ${section.enrollment_limit}</span>
                        </div>
                    </div>
                    ${meetingsHtml}
                    ${section.section_notes ? `<div class="mt-3 text-xs text-gray-600 bg-yellow-50 border border-yellow-100 p-2 rounded leading-relaxed font-mono">Note: ${section.section_notes}</div>` : ''}
                </div>
            `;
        });

        // Resolve Custom Quarter Colors
        const qColors = {
            'AUT': { bg: '#ffcccc', text: '#800000', border: '#ffb3b3' },
            'SPR': { bg: '#ccffcc', text: '#006600', border: '#b3ffb3' },
            'WIN': { bg: '#99ccff', text: '#003399', border: '#80bfff' },
            'SUM': { bg: '#ffffcc', text: '#666600', border: '#ffffb3' }
        };
        const activeColor = qColors[course.quarter] || { bg: '#f3f4f6', text: '#1f2937', border: '#e5e7eb' };

        html += `
            <details class="group bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <summary class="cursor-pointer p-6 hover:bg-gray-50 flex justify-between items-center transition-colors">
                    <div>
                        <div class="flex items-center gap-3 mb-1">
                            <h2 class="text-xl font-bold text-gray-900">${course.course_prefix} ${course.course_number}</h2>
                            <span class="px-2.5 py-1 text-xs font-bold rounded border" style="background-color: ${activeColor.bg}; color: ${activeColor.text}; border-color: ${activeColor.border};">
                                ${course.quarter} ${course.year}
                            </span>
                        </div>
                        <p class="text-lg text-gray-700">${course.course_title}</p>
                        <p class="text-sm text-purple-700 font-medium mt-1">${course.college}</p>
                    </div>
                    <div class="text-gray-400 group-open:rotate-180 transition-transform duration-200">▼</div>
                </summary>
                <div class="p-6 pt-2 bg-gray-50 border-t border-gray-100">
                    ${course.course_notes ? `<div class="text-sm text-gray-600 bg-blue-50 border border-blue-100 p-3 rounded mb-4 font-mono">${course.course_notes}</div>` : ''}
                    ${sectionsHtml}
                </div>
            </details>
        `;
    });

    DOM.results.innerHTML = html;
}

// ==========================================
// 5. EVENT LISTENERS
// ==========================================
window.toggleAll = (expand) => {
    document.querySelectorAll('details').forEach(detail => detail.open = expand);
};

// Trigger search when core inputs change
DOM.searchBtn.addEventListener('click', executeSearch);
DOM.searchIn.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeSearch();
});
DOM.sortSel.addEventListener('change', () => {
    if (DOM.searchIn.value.trim().length >= 2) executeSearch();
});

// Automatically refresh search if user changes a filter while searching
[
    DOM.filterStatus, 
    DOM.filterLevel, 
    DOM.filterCredits, 
    DOM.filterType, 
    DOM.filterFee, 
    DOM.filterPrereq, 
    DOM.filterCrnc, 
    ...DOM.dayFilters
].forEach(el => {
    el.addEventListener('change', () => {
        if (DOM.searchIn.value.trim().length >= 2) executeSearch();
    });
});

// Start everything up
loadDatabase();