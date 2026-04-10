export class UIManager {
    constructor() {
        this.container = document.getElementById('results-container');
        this.resultCount = document.getElementById('result-count');
        this.statusIndicator = document.getElementById('db-status');
        
        this.typeTitles = {
            'LC': 'Lecture', 'QZ': 'Quiz', 'LB': 'Lab', 'SM': 'Seminar',
            'ST': 'Studio', 'PR': 'Practicum', 'CL': 'Clinic', 'CK': 'Clerkship',
            'CO': 'Conference', 'IS': 'Independent Study'
        };
    }

    setReadyStatus() {
        this.statusIndicator.className = "text-[11px] text-emerald-600 font-bold uppercase tracking-wider";
        this.statusIndicator.textContent = "Database Connected";
    }

    setErrorStatus(msg) {
        this.statusIndicator.className = "text-[11px] text-red-600 font-bold uppercase tracking-wider";
        this.statusIndicator.textContent = msg;
    }

    showLoading() {
        this.container.innerHTML = `
            <div class="text-center py-20">
                <i data-lucide="loader-2" class="w-12 h-12 text-purple-700 animate-spin mx-auto mb-3"></i>
                <h3 class="text-lg font-medium text-slate-900">Querying Schedule...</h3>
            </div>`;
        lucide.createIcons();
    }

    showLoadingMore(show) {
        const indicator = document.getElementById('loading-more-indicator');
        if (!indicator && show && this.container) {
            // Removed the margin-top (mt-4) to tighten spacing
            this.container.insertAdjacentHTML('beforeend', `
                <div id="loading-more-indicator" class="text-center py-4 text-slate-500 font-medium">
                    <i data-lucide="loader" class="w-5 h-5 inline-block animate-spin mr-2"></i> Fetching more courses...
                </div>
            `);
            if (window.lucide) lucide.createIcons();
        } else if (indicator && !show) {
            indicator.remove();
        }
    }

    toggleAll(expand) {
        document.querySelectorAll('details.course-card').forEach(detail => detail.open = expand);
    }

    getQuarterColorClasses(quarterStr) {
        const upper = quarterStr.toUpperCase();
        if (upper.includes("AUT")) return "bg-[#ffcccc] text-red-900 border-red-300";
        if (upper.includes("WIN")) return "bg-[#99ccff] text-blue-900 border-blue-300";
        if (upper.includes("SPR")) return "bg-[#ccffcc] text-green-900 border-green-300";
        if (upper.includes("SUM")) return "bg-[#ffffcc] text-yellow-900 border-yellow-300";
        return "bg-slate-100 text-slate-800 border-slate-300";
    }

    renderCourses(courses, append = false) {
        if (this.resultCount && courses.totalMatches !== undefined) {
            this.resultCount.innerText = courses.totalMatches;
        }

        if (!append && courses.length === 0) {
            this.container.innerHTML = `
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
                let typeTooltip = this.typeTitles[sec.type] || sec.type;
                
                // Primary section background lightened to slate-100 to sit better visually
                let rowBgClass = sec.isPrimary ? 'bg-slate-100 hover:bg-slate-200/80 border-slate-200' : 'bg-white hover:bg-slate-50 border-slate-100';
                let idTextClass = sec.isPrimary ? 'text-slate-700' : 'text-slate-400';
                
                let daysHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div>${m.days}</div>`).join('') + `</div>`;
                let timeHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div>${m.time || '-'}</div>`).join('') + `</div>`;
                let bldgHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div>${m.bldg}</div>`).join('') + `</div>`;
                let instHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div class="truncate max-w-[130px]" title="${m.instructor}">${m.instructor}</div>`).join('') + `</div>`;

                let detailsHtml = '';
                const detailBaseClass = "inline-block px-1.5 py-0.5 mr-1 mb-1 border rounded text-[9px] font-bold uppercase tracking-wider cursor-help";
                
                if (sec.crnc) detailsHtml += `<span class="${detailBaseClass} bg-slate-100 text-slate-600 border-slate-300" title="Credit / No Credit Only">CR/NC</span>`;
                if (sec.fee) detailsHtml += `<span class="${detailBaseClass} bg-green-50 text-green-700 border-green-200" title="Extra Course Fee">Fee: $${sec.fee}</span>`;
                
                if (sec.other && sec.other.length > 0) {
                    sec.other.forEach(code => {
                        let label = code;
                        let styles = "bg-slate-50 text-slate-700 border-slate-200"; 
                        let tooltip = "";
                        
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
                    <tr class="border-b ${rowBgClass} transition-colors">
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
                        <td class="py-2.5 px-2 text-[11px] font-medium text-slate-600 align-middle">${sec.enrl} / ${sec.limit}</td>
                        <td class="py-2 px-2 max-w-[200px] align-middle">${detailsHtml}</td>
                    </tr>
                `;

                if (sec.notes) {
                    sectionRowsHtml += `
                        <tr>
                            <td colspan="9" class="bg-amber-50/40 border-b border-amber-100 p-0">
                                <div class="px-3 py-1.5 text-[11px] text-amber-900 font-medium flex items-start gap-2">
                                    <i data-lucide="info" class="w-3.5 h-3.5 mt-0.5 opacity-60 shrink-0"></i>
                                    <span class="font-mono leading-relaxed">${sec.notes}</span>
                                </div>
                            </td>
                        </tr>
                    `;
                }
            });

            const qColor = this.getQuarterColorClasses(course.quarter);

            html += `
                <details class="course-card group bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden mb-4">
                    <summary class="cursor-pointer p-4 border-b border-slate-200 bg-slate-50/50 hover:bg-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
                        <div class="flex items-center gap-3">
                            <h2 class="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                                ${course.prefix} ${course.number}
                            </h2>
                            <h3 class="text-[15px] text-slate-600 font-medium">${course.title}</h3>
                        </div>
                        <div class="flex items-center justify-between md:justify-end w-full md:w-auto gap-4 shrink-0">
                            <!-- Bumped text size to text-xs and increased padding -->
                            <span class="px-3 py-1 rounded-md border text-xs font-bold uppercase tracking-wider shadow-sm ${qColor}">${course.quarter}</span>
                            <div class="text-slate-400 group-open:rotate-180 transition-transform duration-200 shrink-0 bg-white border border-slate-200 rounded p-1 shadow-sm group-hover:bg-slate-50">
                                <i data-lucide="chevron-down" class="w-4 h-4"></i>
                            </div>
                        </div>
                    </summary>

                    <div class="bg-white">
                        ${course.notes ? `
                            <div class="bg-blue-50/40 border-b border-blue-100 px-4 py-2 text-[11px] text-blue-900 font-mono font-medium flex gap-2 items-start">
                                <i data-lucide="alert-circle" class="w-3.5 h-3.5 opacity-70 shrink-0 font-sans mt-0.5"></i>
                                <span class="leading-relaxed">${course.notes}</span>
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

        if (append) {
            const oldSentinel = document.getElementById('scroll-sentinel');
            if (oldSentinel) oldSentinel.remove();
            
            this.container.insertAdjacentHTML('beforeend', html);
        } else {
            this.container.innerHTML = html;
        }

        // Reduced scroll-sentinel height from h-12 to h-2 to tighten spacing
        this.container.insertAdjacentHTML('beforeend', '<div id="scroll-sentinel" class="h-2 w-full flex items-center justify-center opacity-0"></div>');
        lucide.createIcons();
    }
}