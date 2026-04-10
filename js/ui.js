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
        this.statusIndicator.className = "text-[11px] text-theme-accent-main font-bold uppercase tracking-wider";
        this.statusIndicator.textContent = "Database Connected";
    }

    setErrorStatus(msg) {
        this.statusIndicator.className = "text-[11px] text-theme-status-err font-bold uppercase tracking-wider";
        this.statusIndicator.textContent = msg;
    }

    showLoading() {
        this.container.innerHTML = `
            <div class="text-center py-20">
                <i data-lucide="loader-2" class="w-12 h-12 text-theme-accent-main animate-spin mx-auto mb-3"></i>
                <h3 class="text-lg font-medium text-theme-text-main">Querying Schedule...</h3>
            </div>`;
        lucide.createIcons();
    }

    showLoadingMore(show) {
        const indicator = document.getElementById('loading-more-indicator');
        if (!indicator && show && this.container) {
            this.container.insertAdjacentHTML('beforeend', `
                <div id="loading-more-indicator" class="text-center py-4 text-theme-text-muted font-medium">
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
        if (upper.includes("AUT")) return "badge-aut";
        if (upper.includes("WIN")) return "badge-win";
        if (upper.includes("SPR")) return "badge-spr";
        if (upper.includes("SUM")) return "badge-sum";
        return "badge-default";
    }

    renderCourses(courses, append = false) {
        if (this.resultCount && courses.totalMatches !== undefined) {
            this.resultCount.innerText = courses.totalMatches;
        }

        if (!append && courses.length === 0) {
            this.container.innerHTML = `
                <div class="text-center py-20">
                    <i data-lucide="search-x" class="w-12 h-12 text-theme-text-muted mx-auto mb-3"></i>
                    <h3 class="text-lg font-medium text-theme-text-main">No courses found</h3>
                    <p class="text-theme-text-muted text-sm mt-1">Try adjusting your filters or search terms.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        let html = '';
        courses.forEach(course => {
            let sectionRowsHtml = '';
            course.sections.forEach(sec => {
                
                let typeColor = sec.type === 'LC' ? 'tag-blue' : (sec.type === 'QZ' ? 'tag-orange' : (sec.type === 'IS' ? 'tag-purple' : 'tag-slate'));
                let typeTooltip = this.typeTitles[sec.type] || sec.type;
                
                // Updated Primary sections to use the subtle accent purple and standard Tailwind hover brightness
                let rowBgClass = sec.isPrimary ? 'bg-theme-accent-bg hover:brightness-95 dark:hover:brightness-110 border-theme-border' : 'bg-theme-surface hover:bg-theme-surface-hover border-theme-surface-alt';
                let idTextClass = sec.isPrimary ? 'text-theme-text-main' : 'text-theme-text-muted';
                
                let daysHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div>${m.days}</div>`).join('') + `</div>`;
                let timeHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div>${m.time || '-'}</div>`).join('') + `</div>`;
                let bldgHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div>${m.bldg}</div>`).join('') + `</div>`;
                let instHtml = `<div class="space-y-1">` + sec.meetings.map(m => `<div class="truncate max-w-[130px]" title="${m.instructor}">${m.instructor}</div>`).join('') + `</div>`;

                let detailsHtml = '';
                const detailBaseClass = "inline-block px-1.5 py-0.5 mr-1 mb-1 border rounded text-[9px] font-bold uppercase tracking-wider cursor-help";
                
                if (sec.crnc) detailsHtml += `<span class="${detailBaseClass} tag-slate" title="Credit / No Credit Only">CR/NC</span>`;
                if (sec.fee) detailsHtml += `<span class="${detailBaseClass} tag-green" title="Extra Course Fee">Fee: $${sec.fee}</span>`;
                
                if (sec.other && sec.other.length > 0) {
                    sec.other.forEach(code => {
                        let label = code;
                        let styles = "tag-slate"; 
                        let tooltip = "";
                        
                        switch(code) {
                            case 'W': label = 'Writing'; tooltip = "Writing Section"; styles = "tag-indigo"; break;
                            case 'H': label = 'Honors'; tooltip = "Honors Section"; styles = "tag-fuchsia"; break;
                            case 'J': label = 'Jointly Offered'; tooltip = "Jointly Offered"; styles = "tag-teal"; break;
                            case 'O': label = 'Online'; tooltip = "Online Only"; styles = "tag-sky"; break;
                            case 'A': label = 'Async'; tooltip = "Asynchronous Online"; styles = "tag-sky"; break;
                            case 'B': label = 'Hybrid'; tooltip = "Hybrid"; styles = "tag-sky"; break;
                            case 'E': label = 'Community Engaged'; tooltip = "Community Engaged Learning"; styles = "tag-emerald"; break;
                            case 'S': label = 'Service Learning'; tooltip = "Service Learning"; styles = "tag-emerald"; break;
                            case 'R': label = 'Research'; tooltip = "Research Section"; styles = "tag-blue"; break;
                            case '%': label = 'New Course'; tooltip = "New Course"; styles = "tag-lime"; break;
                            case '#': label = 'No FinAid'; tooltip = "Not eligible for Financial Aid"; styles = "tag-red"; break;
                        }
                        detailsHtml += `<span class="${detailBaseClass} ${styles}" title="${tooltip}">${label}</span>`;
                    });
                }

                sectionRowsHtml += `
                    <tr class="border-b ${rowBgClass} transition-colors">
                        <td class="py-2.5 px-3 font-mono text-xs text-theme-text-muted whitespace-nowrap align-middle">
                            ${sec.sln} 
                            <span class="text-[10px] font-extrabold ${idTextClass} mx-1">${sec.id}</span>
                            ${sec.restr ? `<span class="inline-flex items-center cursor-help ml-1" title="Restricted: Check course requirements"><i data-lucide="lock" class="w-3 h-3 text-theme-status-err opacity-80"></i></span>` : ''}
                            ${sec.addCode ? `<span class="inline-flex items-center cursor-help ml-0.5" title="Add Code Required"><i data-lucide="key" class="w-3 h-3 text-theme-status-wait opacity-80"></i></span>` : ''}
                        </td>
                        <td class="py-2.5 px-2 align-middle">
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${typeColor} cursor-help" title="${typeTooltip}">${sec.type}</span>
                        </td>
                        <td class="py-2.5 px-2 text-[11px] font-medium text-theme-text-main align-middle">${sec.cred}</td>
                        <td class="py-2.5 px-2 text-[11px] font-semibold text-theme-text-main whitespace-nowrap align-middle">${daysHtml}</td>
                        <td class="py-2.5 px-2 text-[11px] font-medium text-theme-text-main whitespace-nowrap align-middle">${timeHtml}</td>
                        <td class="py-2.5 px-2 text-[11px] font-medium text-theme-text-main whitespace-nowrap align-middle">${bldgHtml}</td>
                        <td class="py-2.5 px-2 text-[11px] font-medium text-theme-text-main align-middle">${instHtml}</td>
                        <td class="py-2.5 px-2 text-[11px] font-medium text-theme-text-muted align-middle">${sec.enrl} / ${sec.limit}</td>
                        <td class="py-2 px-2 max-w-[200px] align-middle">${detailsHtml}</td>
                    </tr>
                `;

                if (sec.notes) {
                    sectionRowsHtml += `
                        <tr>
                            <td colspan="9" class="bg-alert-amber border-b p-0">
                                <div class="px-3 py-1.5 text-[11px] font-medium flex items-start gap-2 text-theme-text-main">
                                    <i data-lucide="info" class="w-3.5 h-3.5 mt-0.5 opacity-60 shrink-0 text-theme-status-wait"></i>
                                    <span class="font-mono leading-relaxed">${sec.notes}</span>
                                </div>
                            </td>
                        </tr>
                    `;
                }
            });

            const qColor = this.getQuarterColorClasses(course.quarter);

            html += `
                <details class="course-card group bg-theme-surface border border-theme-border rounded-lg shadow-sm overflow-hidden mb-4">
                    <summary class="cursor-pointer p-4 border-b border-theme-border bg-theme-surface-hover flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
                        <div class="flex items-center gap-3">
                            <h2 class="text-lg font-extrabold text-theme-text-main tracking-tight flex items-center gap-2">
                                ${course.prefix} ${course.number}
                            </h2>
                            <h3 class="text-[15px] text-theme-text-muted font-medium">${course.title}</h3>
                        </div>
                        <div class="flex items-center justify-between md:justify-end w-full md:w-auto gap-4 shrink-0">
                            <span class="px-3 py-1 rounded-md border text-xs font-bold uppercase tracking-wider shadow-sm ${qColor}">${course.quarter}</span>
                            <div class="text-theme-text-muted group-open:rotate-180 transition-transform duration-200 shrink-0 bg-theme-surface border border-theme-border rounded p-1 shadow-sm group-hover:bg-theme-surface-alt">
                                <i data-lucide="chevron-down" class="w-4 h-4"></i>
                            </div>
                        </div>
                    </summary>

                    <div class="bg-theme-surface">
                        ${course.notes ? `
                            <div class="bg-alert-amber border-b px-4 py-2 text-[11px] font-mono font-medium flex gap-2 items-start text-theme-text-main">
                                <i data-lucide="alert-circle" class="w-3.5 h-3.5 opacity-70 shrink-0 font-sans mt-0.5 text-theme-text-muted"></i>
                                <span class="leading-relaxed">${course.notes}</span>
                            </div>
                        ` : ''}

                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-theme-surface-hover text-[10px] uppercase font-bold text-theme-text-muted tracking-wider">
                                    <tr>
                                        <th class="py-2 px-3 border-b font-semibold whitespace-nowrap">SLN Sec Restr</th>
                                        <th class="py-2 px-2 border-b font-semibold whitespace-nowrap">Type</th>
                                        <th class="py-2 px-2 border-b font-semibold whitespace-nowrap">CR</th>
                                        <th class="py-2 px-2 border-b font-semibold whitespace-nowrap">Days</th>
                                        <th class="py-2 px-2 border-b font-semibold whitespace-nowrap">Time</th>
                                        <th class="py-2 px-2 border-b font-semibold whitespace-nowrap">Bldg/Rm</th>
                                        <th class="py-2 px-2 border-b font-semibold whitespace-nowrap">Instructor</th>
                                        <th class="py-2 px-2 border-b font-semibold whitespace-nowrap">Enrl/Lim</th>
                                        <th class="py-2 px-2 border-b font-semibold whitespace-nowrap">Details</th>
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

        this.container.insertAdjacentHTML('beforeend', '<div id="scroll-sentinel" class="h-2 w-full flex items-center justify-center opacity-0"></div>');
        lucide.createIcons();
    }
}