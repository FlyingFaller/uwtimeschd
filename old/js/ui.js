// Handles all HTML interactions, filter state reading, and dynamic rendering

let lastFilterStateJson = "";
let checkStateChangedFn = null;

export function initUI(onSearchExecute) {
    const searchInput = document.getElementById('omni-search');
    const searchBtn = document.getElementById('search-btn');

    // Attach Toggle logic to buttons
    document.querySelectorAll('.filter-btn, .filter-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.classList.toggle('active');
            
            if (e.target.classList.contains('active')) {
                e.target.classList.remove('border-slate-300', 'text-slate-600', 'bg-white', 'hover:bg-slate-50', 'hover:bg-slate-100');
                e.target.classList.add('border-purple-300', 'bg-purple-50', 'text-purple-700');
            } else {
                e.target.classList.add('border-slate-300', 'text-slate-600', 'bg-white');
                e.target.classList.remove('border-purple-300', 'bg-purple-50', 'text-purple-700');
                if (e.target.classList.contains('filter-chip')) e.target.classList.add('hover:bg-slate-100');
                if (e.target.classList.contains('filter-btn')) e.target.classList.add('hover:bg-slate-50');
            }
            checkStateChanged();
        });
    });

    // Special behavior for Day Mode (Include/Exclude)
    const dayModeBtns = document.querySelectorAll('#day-mode-toggles button');
    dayModeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            dayModeBtns.forEach(b => {
                b.classList.remove('bg-white', 'shadow-sm', 'text-slate-700', 'active-mode');
                b.classList.add('text-slate-500');
            });
            e.target.classList.remove('text-slate-500');
            e.target.classList.add('bg-white', 'shadow-sm', 'text-slate-700', 'active-mode');
            checkStateChanged();
        });
    });

    // Delegate listener for dynamically injected Major checkboxes
    document.getElementById('major-list').addEventListener('change', (e) => {
        if (e.target.classList.contains('major-checkbox')) {
            // Handle "All" mutually exclusive logic
            if (e.target.value === 'ALL' && e.target.checked) {
                document.querySelectorAll('.major-checkbox:not([value="ALL"])').forEach(cb => cb.checked = false);
            } else if (e.target.value !== 'ALL' && e.target.checked) {
                document.querySelector('.major-checkbox[value="ALL"]').checked = false;
            }
            checkStateChanged();
        }
    });

    // Listen for static input changes
    document.querySelectorAll('.filter-input, .type-checkbox').forEach(input => {
        input.addEventListener('change', checkStateChanged);
        input.addEventListener('input', checkStateChanged); // for text fields
    });

    // Logic for filtering the list of 350+ Majors via local search
    document.getElementById('major-search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('#major-list label').forEach(label => {
            if (label.innerText.toLowerCase().includes(q)) label.style.display = 'flex';
            else label.style.display = 'none';
        });
    });
    
    // Clear Majors helper
    document.getElementById('clear-majors').addEventListener('click', () => {
        document.querySelectorAll('.major-checkbox:not([value="ALL"])').forEach(cb => cb.checked = false);
        document.querySelector('.major-checkbox[value="ALL"]').checked = true;
        document.getElementById('major-search').value = "";
        document.querySelectorAll('#major-list label').forEach(l => l.style.display = 'flex');
        checkStateChanged();
    });

    // Execute Search Triggers
    searchBtn.addEventListener('click', onSearchExecute);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !searchBtn.disabled) onSearchExecute();
    });

    // Global Expand/Collapse
    document.getElementById('btn-expand-all').addEventListener('click', () => {
        document.querySelectorAll('details.course-card').forEach(d => d.open = true);
    });
    document.getElementById('btn-collapse-all').addEventListener('click', () => {
        document.querySelectorAll('details.course-card').forEach(d => d.open = false);
    });

    function checkStateChanged() {
        const currentState = JSON.stringify(getFilterState());
        if (currentState !== lastFilterStateJson) {
            searchBtn.disabled = false;
            searchBtn.classList.remove('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
            searchBtn.classList.add('bg-purple-600', 'text-white', 'hover:bg-purple-700', 'shadow-md');
        } else {
            searchBtn.disabled = true;
            searchBtn.classList.add('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
            searchBtn.classList.remove('bg-purple-600', 'text-white', 'hover:bg-purple-700', 'shadow-md');
        }
    }
    
    checkStateChangedFn = checkStateChanged;
}

export function renderMajors(majorsList) {
    const container = document.getElementById('major-list');
    let html = `<label class="flex items-center gap-2 cursor-pointer hover:bg-slate-200 p-1 rounded transition-colors"><input type="checkbox" value="ALL" class="accent-purple-600 major-checkbox" checked> All Departments</label>`;
    
    majorsList.forEach(major => {
        html += `<label class="flex items-center gap-2 cursor-pointer hover:bg-slate-200 p-1 rounded transition-colors"><input type="checkbox" value="${major}" class="accent-purple-600 major-checkbox"> ${major}</label>`;
    });
    container.innerHTML = html;
}

export function setReadyState(filtersObject) {
    lastFilterStateJson = JSON.stringify(filtersObject);
    const searchBtn = document.getElementById('search-btn');
    searchBtn.disabled = true;
    searchBtn.classList.add('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
    searchBtn.classList.remove('bg-purple-600', 'text-white', 'hover:bg-purple-700', 'shadow-md');
}

export function getFilterState() {
    return {
        query: document.getElementById('omni-search').value.trim(),
        majors: Array.from(document.querySelectorAll('.major-checkbox:checked')).map(cb => cb.value),
        levels: Array.from(document.querySelectorAll('#level-filters .active')).map(b => b.dataset.val),
        credMin: document.getElementById('cred-min').value ? parseFloat(document.getElementById('cred-min').value) : null,
        credMax: document.getElementById('cred-max').value ? parseFloat(document.getElementById('cred-max').value) : null,
        timeScope: document.getElementById('time-scope').value,
        dayMode: document.querySelector('#day-mode-toggles .active-mode').dataset.mode,
        days: Array.from(document.querySelectorAll('#day-filters .active')).map(b => b.dataset.val),
        timeStart: document.getElementById('time-start').value,
        timeEnd: document.getElementById('time-end').value,
        types: Array.from(document.querySelectorAll('.type-checkbox:checked')).map(cb => cb.value),
        attrs: Array.from(document.querySelectorAll('#attr-filters .active')).map(b => b.dataset.val),
        sort: document.getElementById('sort-select').value
    };
}


// --- Rendering Logic ---

const getQuarterColorClasses = (quarterStr) => {
    const upper = quarterStr.toUpperCase();
    if (upper.includes("AUT")) return "bg-orange-100 text-orange-800 border-orange-200";
    if (upper.includes("WIN")) return "bg-sky-100 text-sky-800 border-sky-200";
    if (upper.includes("SPR")) return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (upper.includes("SUM")) return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-slate-100 text-slate-800 border-slate-200";
};

const typeTitles = {
    'LC': 'Lecture', 'QZ': 'Quiz', 'LB': 'Lab', 'SM': 'Seminar',
    'ST': 'Studio', 'PR': 'Practicum', 'CL': 'Clinic', 'CK': 'Clerkship',
    'CO': 'Conference', 'IS': 'Independent Study'
};

export function renderCourses(courses) {
    const container = document.getElementById('results-container');
    document.getElementById('result-count').innerText = courses.length;

    if (courses.length === 0) {
        container.innerHTML = `
            <div class="text-center py-20">
                <i data-lucide="search-x" class="w-12 h-12 text-slate-300 mx-auto mb-3"></i>
                <h3 class="text-lg font-medium text-slate-900">No courses found</h3>
                <p class="text-slate-500 text-sm mt-1">Try adjusting your filters or search terms.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    let html = '';
    courses.forEach(course => {
        let sectionRowsHtml = '';
        
        course.sections.forEach(sec => {
            let typeColor = sec.type === 'LC' ? 'bg-blue-100 text-blue-800' : (sec.type === 'QZ' ? 'bg-orange-100 text-orange-800' : (sec.type === 'IS' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800'));
            let typeTooltip = typeTitles[sec.type] || sec.type;
            
            let rowBgClass = sec.isPrimary ? 'bg-slate-50 hover:bg-slate-100' : 'bg-white hover:bg-slate-50';
            let idTextClass = sec.isPrimary ? 'text-slate-600' : 'text-slate-400';
            
            let daysHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div>${m.days}</div>`).join('') + `</div>`;
            let timeHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div>${m.time || '-'}</div>`).join('') + `</div>`;
            let bldgHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div>${m.bldg}</div>`).join('') + `</div>`;
            let instHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div class="truncate max-w-[110px]" title="${m.instructor}">${m.instructor}</div>`).join('') + `</div>`;

            let detailsHtml = '';
            const detailBaseClass = "inline-block px-1.5 py-0.5 mr-1 mb-1 border rounded-[4px] text-[9px] font-bold uppercase tracking-wider cursor-help";
            
            if (sec.crnc) detailsHtml += `<span class="${detailBaseClass} bg-slate-100 text-slate-600 border-slate-300" title="Credit / No Credit Only">CR/NC</span>`;
            if (sec.fee) detailsHtml += `<span class="${detailBaseClass} bg-green-50 text-green-700 border-green-200" title="Extra Course Fee">Fee: $${sec.fee}</span>`;
            
            if (sec.other && sec.other.length > 0) {
                sec.other.forEach(code => {
                    let label = code; let styles = "bg-slate-50 text-slate-700 border-slate-200"; let tooltip = "";
                    switch(code) {
                        case 'W': label = 'Writing'; tooltip = "Writing Section"; styles = "bg-indigo-50 text-indigo-700 border-indigo-200"; break;
                        case 'H': label = 'Honors'; tooltip = "Honors Section"; styles = "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200"; break;
                        case 'J': label = 'Jointly Offered'; tooltip = "Jointly Offered"; styles = "bg-teal-50 text-teal-700 border-teal-200"; break;
                        case 'O': label = 'Online'; tooltip = "Online Only"; styles = "bg-sky-50 text-sky-700 border-sky-200"; break;
                        case 'A': label = 'Async'; tooltip = "Asynchronous Online"; styles = "bg-sky-50 text-sky-700 border-sky-200"; break;
                        case 'B': label = 'Hybrid'; tooltip = "Hybrid"; styles = "bg-sky-50 text-sky-700 border-sky-200"; break;
                        case 'E': label = 'Community Engaged'; tooltip = "Community Engaged Learning"; styles = "bg-emerald-50 text-emerald-700 border-emerald-200"; break;
                        case 'S': label = 'Service Learning'; tooltip = "Service Learning"; styles = "bg-emerald-50 text-emerald-700 border-emerald-200"; break;
                        case 'R': label = 'Research'; tooltip = "Research Section"; styles = "bg-blue-50 text-blue-700 border-blue-200"; break;
                        case '%': label = 'New Course'; tooltip = "New Course"; styles = "bg-lime-50 text-lime-700 border-lime-200"; break;
                        case '#': label = 'No FinAid'; tooltip = "Not eligible for Financial Aid"; styles = "bg-red-50 text-red-700 border-red-200"; break;
                    }
                    detailsHtml += `<span class="${detailBaseClass} ${styles}" title="${tooltip}">${label}</span>`;
                });
            }

            sectionRowsHtml += `
                <tr class="border-b border-slate-100 ${rowBgClass} transition-colors">
                    <td class="py-2.5 px-3 font-mono text-xs text-slate-600 whitespace-nowrap align-middle">
                        ${sec.sln} 
                        <span class="text-[10px] font-extrabold ${idTextClass} mx-1">${sec.id}</span>
                        ${sec.restr ? `<span class="inline-flex items-center cursor-help ml-1" title="Restricted: Check course requirements"><i data-lucide="lock" class="w-3 h-3 text-rose-500 opacity-80"></i></span>` : ''}
                        ${sec.addCode ? `<span class="inline-flex items-center cursor-help ml-0.5" title="Add Code Required"><i data-lucide="key" class="w-3 h-3 text-amber-500 opacity-80"></i></span>` : ''}
                    </td>
                    <td class="py-2.5 px-2 align-middle">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${typeColor} cursor-help" title="${typeTooltip}">${sec.type}</span>
                    </td>
                    <td class="py-2.5 px-2 text-[11px] font-medium text-slate-700 align-middle">${sec.cred}</td>
                    <td class="py-2.5 px-2 text-[11px] font-semibold text-slate-800 whitespace-nowrap align-middle">${daysHtml}</td>
                    <td class="py-2.5 px-2 text-[11px] font-medium text-slate-700 whitespace-nowrap align-middle">${timeHtml}</td>
                    <td class="py-2.5 px-2 text-[11px] font-medium text-slate-700 whitespace-nowrap align-middle">${bldgHtml}</td>
                    <td class="py-2.5 px-2 text-[11px] font-medium text-slate-800 align-middle">${instHtml}</td>
                    <td class="py-2.5 px-2 text-[11px] font-medium text-slate-600 align-middle">${sec.enrl}/${sec.limit}</td>
                    <td class="py-2 px-2 max-w-[200px] align-middle">${detailsHtml}</td>
                </tr>
            `;

            if (sec.notes) {
                sectionRowsHtml += `
                    <tr>
                        <td colspan="9" class="bg-amber-50/40 border-b border-amber-100/50 p-0">
                            <div class="px-3 py-1.5 text-[11px] text-amber-900 font-medium flex items-start gap-2">
                                <i data-lucide="info" class="w-3.5 h-3.5 mt-0.5 opacity-60 shrink-0"></i>
                                <span class="font-mono">${sec.notes}</span>
                            </div>
                        </td>
                    </tr>
                `;
            }
        });

        const qColor = getQuarterColorClasses(course.quarter);

        html += `
            <details class="course-card group bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden">
                <summary class="cursor-pointer p-4 border-b border-slate-200 bg-slate-50/50 hover:bg-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
                    <div class="flex items-center gap-3">
                        <h2 class="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                            ${course.prefix} ${course.number}
                        </h2>
                        <h3 class="text-base text-slate-600 font-medium">${course.title}</h3>
                    </div>
                    <div class="flex items-center justify-between md:justify-end w-full md:w-auto gap-4 shrink-0">
                        <span class="px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${qColor}">${course.quarter}</span>
                        <div class="text-slate-400 group-open:rotate-180 transition-transform duration-200 shrink-0">
                            <i data-lucide="chevron-down" class="w-6 h-6"></i>
                        </div>
                    </div>
                </summary>
                <div class="bg-white">
                    ${course.notes ? `
                        <div class="bg-blue-50/40 border-b border-blue-100 px-4 py-3 text-[11px] text-blue-900 font-mono font-medium flex gap-2 items-start">
                            <i data-lucide="alert-circle" class="w-4 h-4 opacity-70 shrink-0 font-sans mt-0.5"></i>
                            <span>${course.notes}</span>
                        </div>
                    ` : ''}
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead class="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                <tr>
                                    <th class="py-2 px-3 font-semibold whitespace-nowrap">SLN Sec Restr</th>
                                    <th class="py-2 px-2 font-semibold whitespace-nowrap">Type</th>
                                    <th class="py-2 px-2 font-semibold whitespace-nowrap">CR</th>
                                    <th class="py-2 px-2 font-semibold whitespace-nowrap">Days</th>
                                    <th class="py-2 px-2 font-semibold whitespace-nowrap">Time</th>
                                    <th class="py-2 px-2 font-semibold whitespace-nowrap">Bldg/Rm</th>
                                    <th class="py-2 px-2 font-semibold whitespace-nowrap">Instructor</th>
                                    <th class="py-2 px-2 font-semibold whitespace-nowrap">Enrl/Lim</th>
                                    <th class="py-2 px-2 font-semibold whitespace-nowrap">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sectionRowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </details>
        `;
    });

    container.innerHTML = html;
    lucide.createIcons();
}