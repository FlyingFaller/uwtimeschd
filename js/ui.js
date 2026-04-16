import { TAG_CONFIG, TYPE_TITLES } from './constants.js';
import { getQuarterColorClasses } from './utils.js';

export class UIManager {
    constructor() {
        this.container       = document.getElementById('results-container');
        this.resultCount     = document.getElementById('result-count');
        this.statusIndicator = document.getElementById('db-status');
    }

    setReadyStatus() {
        this.statusIndicator.className   = "text-[11px] text-theme-accent-main font-bold uppercase tracking-wider";
        this.statusIndicator.textContent = "Database Connected";
    }

    setErrorStatus(msg) {
        this.statusIndicator.className   = "text-[11px] text-theme-status-err font-bold uppercase tracking-wider";
        this.statusIndicator.textContent = msg;
    }

    showLoading() {
        this.container.innerHTML = `
            <div class="text-center py-20">
                <i data-lucide="loader-2" class="w-12 h-12 text-theme-accent-main animate-spin mx-auto mb-3"></i>
                <h3 class="text-lg font-medium text-theme-text-main">Querying Schedule...</h3>
            </div>`;
        if (window.lucide) lucide.createIcons();
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

    renderEmptyResetState() {
        this.container.innerHTML = `
            <div class="text-center py-20">
                <i data-lucide="info" class="w-12 h-12 text-theme-text-muted mx-auto mb-3"></i>
                <h3 class="text-lg font-medium text-theme-text-main">Filters Reset</h3>
                <p class="text-theme-text-muted text-sm mt-1">Enter a search term or select filters to see results.</p>
            </div>`;
        if (this.resultCount) this.resultCount.textContent = '0';
        if (window.lucide) lucide.createIcons();
    }

    renderErrorState() {
        if (this.container) {
            this.container.innerHTML = `<div class="text-theme-status-err p-8 text-center font-bold">Query Error Occurred.</div>`;
        }
    }

    toggleAll(expand) {
        document.querySelectorAll('details.course-card').forEach(detail => detail.open = expand);
    }

    _createDetailsHtml(sec) {
        let html = '';
        const detailBaseClass = "inline-block px-1.5 py-0.5 border rounded text-[9px] font-bold uppercase tracking-wider cursor-help";
        
        if (sec.crnc) html += `<span class="${detailBaseClass} tag-slate" title="Credit / No Credit Only">CR/NC</span>`;
        if (sec.fee) html += `<span class="${detailBaseClass} tag-green" title="Extra Course Fee">Fee: $${sec.fee}</span>`;
        
        if (sec.other && sec.other.length > 0) {
            sec.other.forEach(code => {
                const config = TAG_CONFIG[code] || { label: code, tooltip: "", styles: "tag-slate" };
                html += `<span class="${detailBaseClass} ${config.styles}" title="${config.tooltip}">${config.label}</span>`;
            });
        }
        return html;
    }

    _createSectionRow(sec) {
        const isPrimary = sec.isPrimary;
        const typeColor = sec.type === 'LC' ? 'tag-blue' : (sec.type === 'QZ' ? 'tag-orange' : (sec.type === 'IS' ? 'tag-purple' : 'tag-slate'));
        const typeTooltip = TYPE_TITLES[sec.type] || sec.type;
        
        // Use our isolated primary-row colors
        const rowBgClass = isPrimary ? 'bg-theme-row-primary hover:bg-theme-row-primary-hover' : 'bg-theme-surface hover:bg-theme-surface-hover';
        
        const textClass = isPrimary ? 'text-theme-text-main font-bold' : 'text-theme-text-muted font-medium';
        const baseTdClass = `py-2.5 px-2 text-[11px] align-middle ${textClass}`;
        const tabularTdClass = `${baseTdClass} tabular-nums`;

        // We ALWAYS apply the bottom border now to separate the row from its notes.
        const borderClass = isPrimary ? 'border-theme-border' : 'border-theme-surface-alt';
        const rowBorderToggle = `border-b ${borderClass}`;

        const daysHtml = `<div class="space-y-1">${sec.meetings.map(m => `<div>${m.days}</div>`).join('')}</div>`;
        const timeHtml = `<div class="space-y-1">${sec.meetings.map(m => `<div>${m.time || '-'}</div>`).join('')}</div>`;
        const bldgHtml = `<div class="space-y-1">${sec.meetings.map(m => `<div>${m.bldg}</div>`).join('')}</div>`;
        const instHtml = `<div class="space-y-1">${sec.meetings.map(m => `<div class="truncate max-w-[130px]" title="${m.instructor}">${m.instructor}</div>`).join('')}</div>`;

        let rowHtml = `
            <tr class="${rowBorderToggle} ${rowBgClass} transition-colors">
                <td class="py-2.5 px-3 text-xs whitespace-nowrap align-middle">
                    <span class="${textClass} tabular-nums">${sec.sln}</span>
                    <span class="${textClass} tabular-nums ml-1.5">${sec.id}</span>
                    ${sec.restr ? `<span class="inline-flex items-center cursor-help ml-1" title="Restricted: Check course requirements"><i data-lucide="lock" class="w-3 h-3 text-theme-status-err opacity-80"></i></span>` : ''}
                    ${sec.addCode ? `<span class="inline-flex items-center cursor-help ml-0.5" title="Add Code Required"><i data-lucide="key" class="w-3 h-3 text-theme-status-wait opacity-80"></i></span>` : ''}
                </td>
                <td class="py-2.5 px-2 align-middle">
                    <span class="px-1.5 py-0.5 border rounded text-[10px] font-bold ${typeColor} cursor-help" title="${typeTooltip}">${sec.type}</span>
                </td>
                <td class="${tabularTdClass}">${sec.cred}</td>
                <td class="${baseTdClass} whitespace-nowrap">${daysHtml}</td>
                <td class="${baseTdClass} whitespace-nowrap">${timeHtml}</td>
                <td class="${baseTdClass} whitespace-nowrap">${bldgHtml}</td>
                <td class="${baseTdClass}">${instHtml}</td>
                <td class="${tabularTdClass}">${sec.enrl} / ${sec.limit}</td>
                <td class="py-2 px-2 align-middle">
                    <div class="flex flex-wrap gap-1">
                        ${this._createDetailsHtml(sec)}
                    </div>
                </td>
            </tr>
        `;

        if (sec.notes) {
            rowHtml += `
                <tr class="border-b ${borderClass}">
                    <td colspan="9" class="bg-alert-amber p-0">
                        <div class="px-3 py-2 text-[11px] font-medium flex items-start gap-2">
                            <i data-lucide="info" class="w-3.5 h-3.5 mt-0.5 opacity-70 shrink-0 text-theme-status-wait"></i>
                            <span class="leading-relaxed">${sec.notes}</span>
                        </div>
                    </td>
                </tr>
            `;
        }
        return rowHtml;
    }

_createCourseCard(course, majorLookup = {}) {
        const sectionRowsHtml = course.sections.map(sec => this._createSectionRow(sec)).join('');
        const qColor = getQuarterColorClasses(course.quarter);

        const code = majorLookup[course.prefix] || course.prefix; 
        const slug = code.replace(/\s+/g, '').toLowerCase(); 
        const anchor = `${course.prefix.replace(/\s+/g, '').toLowerCase()}${course.number}`;
        const courseLink = `https://www.washington.edu/students/crscat/${slug}.html#${anchor}`;

        const hasReqs = course.hasPrereqs || course.genEd.length > 0;

        return `
            <details class="course-card group/card bg-theme-surface border border-theme-border rounded-lg shadow-sm overflow-hidden mb-4">
                
                <summary class="cursor-pointer px-4 pt-4 pb-4 group-open/card:pb-1.5 border-b border-theme-border group-open/card:border-b-0 bg-theme-surface hover:bg-theme-surface-hover [details:has(thead:hover)_&]:bg-theme-surface-hover transition-colors group/summary">
                    
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <a href="${courseLink}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 group/link" onclick="event.stopPropagation()">
                            <h2 class="text-lg font-extrabold text-theme-text-main tracking-tight flex items-center gap-2 transition-colors group-hover/link:text-theme-accent-main">
                                ${course.prefix} ${course.number}
                            </h2>
                            <h3 class="text-[15px] text-theme-text-muted font-medium transition-colors group-hover/link:text-theme-accent-hover">
                                ${course.title}
                            </h3>
                        </a>

                        <div class="flex items-center justify-between md:justify-end w-full md:w-auto gap-4 shrink-0">
                            <span class="px-3 py-1 rounded-md border text-xs font-bold uppercase tracking-wider shadow-sm ${qColor}">${course.quarter}</span>
                            <div class="text-theme-text-muted group-open/card:rotate-180 transition-transform duration-200 shrink-0 bg-theme-surface border border-theme-border rounded p-1 shadow-sm group-hover/summary:bg-theme-surface-alt [details:has(thead:hover)_&]:bg-theme-surface-alt">
                                <i data-lucide="chevron-down" class="w-4 h-4"></i>
                            </div>
                        </div>
                    </div>

                    ${(hasReqs || course.notes) ? `
                        <div class="hidden group-open/card:flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2">
                            ${course.hasPrereqs ? `
                                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 border rounded text-[10px] font-bold uppercase tracking-wider tag-red" title="Prerequisites Required">
                                    <i data-lucide="alert-circle" class="w-3 h-3"></i> PREREQS
                                </span>
                            ` : ''}
                            ${course.genEd.map(req => `
                                <span class="inline-flex items-center px-1.5 py-0.5 border rounded text-[10px] font-bold tracking-wider tag-indigo" title="General Education Requirement">
                                    ${req}
                                </span>
                            `).join('')}
                            ${course.notes ? `
                                <span class="flex items-center gap-1.5 text-[11px] text-theme-text-muted font-medium ml-1">
                                    <i data-lucide="info" class="w-3.5 h-3.5 opacity-70 shrink-0"></i>
                                    <span class="leading-relaxed">${course.notes}</span>
                                </span>
                            ` : ''}
                        </div>
                    ` : ''}
                </summary>

                <div class="bg-theme-surface">
                    <div class="overflow-x-auto">
                        <table class="w-full min-w-[900px] text-left border-collapse table-fixed">
                            
                            <thead class="bg-theme-surface hover:bg-theme-surface-hover [details:has(summary:hover)_&]:bg-theme-surface-hover transition-colors text-[10px] uppercase font-extrabold text-theme-text-muted tracking-wider border-b-2 border-theme-border">
                                <tr>
                                    <th class="py-2 px-3 border-none font-semibold whitespace-nowrap w-[12%] bg-transparent">SLN Sec Restr</th>
                                    <th class="py-2 px-2 border-none font-semibold whitespace-nowrap w-[7%] bg-transparent">Type</th>
                                    <th class="py-2 px-2 border-none font-semibold whitespace-nowrap w-[5%] bg-transparent">CR</th>
                                    <th class="py-2 px-2 border-none font-semibold whitespace-nowrap w-[8%] bg-transparent">Days</th>
                                    <th class="py-2 px-2 border-none font-semibold whitespace-nowrap w-[12%] bg-transparent">Time</th>
                                    <th class="py-2 px-2 border-none font-semibold whitespace-nowrap w-[12%] bg-transparent">Bldg/Rm</th>
                                    <th class="py-2 px-2 border-none font-semibold whitespace-nowrap w-[15%] bg-transparent">Instructor</th>
                                    <th class="py-2 px-2 border-none font-semibold whitespace-nowrap w-[9%] bg-transparent">Enrl/Lim</th>
                                    <th class="py-2 px-2 border-none font-semibold whitespace-nowrap w-auto bg-transparent">Details</th>
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
    }

    renderCourses(courses, totalMatches, append = false, majorLookup = {}) {
        if (this.resultCount && totalMatches !== undefined) {
            this.resultCount.innerText = totalMatches;
        }

        if (!append && courses.length === 0) {
            this.container.innerHTML = `
                <div class="text-center py-20">
                    <i data-lucide="search-x" class="w-12 h-12 text-theme-text-muted mx-auto mb-3"></i>
                    <h3 class="text-lg font-medium text-theme-text-main">No courses found</h3>
                    <p class="text-theme-text-muted text-sm mt-1">Try adjusting your filters or search terms.</p>
                </div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        const html = courses.map(course => this._createCourseCard(course, majorLookup)).join('');

        if (append) {
            const oldSentinel = document.getElementById('scroll-sentinel');
            if (oldSentinel) oldSentinel.remove();
            this.container.insertAdjacentHTML('beforeend', html);
        } else {
            this.container.innerHTML = html;
        }

        this.container.insertAdjacentHTML('beforeend', '<div id="scroll-sentinel" class="h-2 w-full flex items-center justify-center opacity-0"></div>');
        if (window.lucide) lucide.createIcons();
    }
}