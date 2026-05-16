import { TAG_CONFIG, TYPE_TITLES, TYPE_COLORS } from './constants.js';
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

    renderErrorState(error, queryContext) {
        if (this.container) {
            const errorMsg = error?.message || error || "Unknown Error";
            this.container.innerHTML = `
                <div class="p-8">
                    <div class="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-6 text-left font-mono text-sm overflow-auto">
                        <div class="font-bold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                            <i data-lucide="alert-triangle" class="w-5 h-5"></i> Query Error Occurred
                        </div>
                        <div class="mb-4 text-theme-text-main whitespace-pre-wrap">${errorMsg}</div>
                        ${queryContext ? `
                        <div class="font-bold text-theme-text-muted mb-2">Active Filters:</div>
                        <pre class="text-xs text-theme-text-muted whitespace-pre-wrap bg-theme-surface p-3 rounded border border-theme-border">${queryContext}</pre>
                        ` : ''}
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }

    toggleAll(expand) {
        document.querySelectorAll('details.course-card').forEach(detail => detail.open = expand);
    }

    _createDetailsHtml(sec) {
        let html = '';
        const detailBaseClass = "inline-block px-1.5 py-0.5 border rounded text-[9px] font-bold uppercase tracking-wider cursor-help";
        
        if (sec.is_credit_no_credit) html += `<span class="${detailBaseClass} tag-slate" title="Credit / No Credit Only">CR/NC</span>`;
        if (sec.fee) html += `<span class="${detailBaseClass} tag-green" title="Extra Course Fee">Fee: $${sec.fee}</span>`;
        
        if (sec.ui_badges && sec.ui_badges.length > 0) {
            sec.ui_badges.forEach(code => {
                const config = TAG_CONFIG[code] || { label: code, tooltip: "", styles: "tag-slate" };
                html += `<span class="${detailBaseClass} ${config.styles}" title="${config.tooltip}">${config.label}</span>`;
            });
        }
        return html;
    }

    _createSectionRow(sec) {
        const isPrimary = sec.is_primary;
        
        const typeColor = TYPE_COLORS[sec.section_type] || TYPE_COLORS.default;
        const typeTooltip = TYPE_TITLES[sec.section_type] || sec.section_type || 'N/A';
        
        const rowBgClass = isPrimary ? 'bg-theme-row-primary hover:bg-theme-row-primary-hover' : 'bg-theme-surface hover:bg-theme-surface-hover';
        
        const textClass = isPrimary ? 'text-theme-text-main font-bold' : 'text-theme-text-muted font-medium';
        const baseTdClass = `py-2.5 px-2 text-[11px] align-middle ${textClass}`;
        const tabularTdClass = `${baseTdClass} tabular-nums`;

        const borderClass = isPrimary ? 'border-theme-border' : 'border-theme-surface-alt';
        const rowBorderToggle = `border-b ${borderClass}`;

        const daysHtml = `<div class="space-y-1">${sec.meetings.map(m => `<div>${m.ui_days}</div>`).join('')}</div>`;
        const timeHtml = `<div class="space-y-1">${sec.meetings.map(m => `<div>${m.ui_time}</div>`).join('')}</div>`;
        const bldgHtml = `<div class="space-y-1">${sec.meetings.map(m => `<div>${m.building_room || ''}</div>`).join('')}</div>`;
        const instHtml = `<div class="space-y-1">${sec.meetings.map(m => `<div class="truncate max-w-[130px]" title="${m.instructor || ''}">${m.instructor || ''}</div>`).join('')}</div>`;

        let rowHtml = `
            <tr class="${rowBorderToggle} ${rowBgClass} transition-colors">
                <td class="py-2.5 px-3 text-xs whitespace-nowrap align-middle">
                    <span class="${textClass} tabular-nums">${sec.SLN || 'N/A'}</span>
                    <span class="${textClass} tabular-nums ml-1.5">${sec.ui_short_id}</span>
                    ${sec.restrictions?.restricted_registration ? `<span class="inline-flex items-center cursor-help ml-1" title="Restricted: Check course requirements"><i data-lucide="lock" class="w-3 h-3 text-theme-status-err opacity-80"></i></span>` : ''}
                    ${sec.restrictions?.add_code_required ? `<span class="inline-flex items-center cursor-help ml-0.5" title="Add Code Required"><i data-lucide="key" class="w-3 h-3 text-theme-status-wait opacity-80"></i></span>` : ''}
                </td>
                <td class="py-2.5 px-2 align-middle">
                    <span class="px-1.5 py-0.5 border rounded text-[10px] font-bold ${typeColor} cursor-help" title="${typeTooltip}">${sec.section_type || 'N/A'}</span>
                </td>
                <td class="${tabularTdClass}">${sec.ui_credits}</td>
                <td class="${baseTdClass} whitespace-nowrap">${daysHtml}</td>
                <td class="${baseTdClass} whitespace-nowrap">${timeHtml}</td>
                <td class="${baseTdClass} whitespace-nowrap">${bldgHtml}</td>
                <td class="${baseTdClass}">${instHtml}</td>
                <td class="${tabularTdClass}">${sec.enrolled !== null ? sec.enrolled : '-'} / ${sec.enrollment_limit !== null ? sec.enrollment_limit : '-'}</td>
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

    _createCourseCard(course, prefixToMajorCode = {}) {
        const sectionRowsHtml = course.sections.map(sec => this._createSectionRow(sec)).join('');
        
        const formattedQuarter = `${course.ui_quarter} ${course.ui_year}`;
        const qColor = getQuarterColorClasses(formattedQuarter);

        const code = prefixToMajorCode[course.course_prefix] || course.course_prefix; 
        const slug = code.replace(/\s+/g, '').toLowerCase(); 
        const anchor = `${course.course_prefix.replace(/\s+/g, '').toLowerCase()}${course.course_number}`;
        const courseLink = `https://www.washington.edu/students/crscat/${slug}.html#${anchor}`;

        const hasReqs = course.has_prerequisites || (course.gen_ed_reqs && course.gen_ed_reqs.length > 0);

        return `
            <details class="course-card group/card bg-theme-surface border border-theme-border rounded-lg shadow-sm overflow-hidden mb-4">
                
                <summary class="cursor-pointer px-4 pt-4 pb-4 group-open/card:pb-1.5 border-b border-theme-border group-open/card:border-b-0 bg-theme-surface hover:bg-theme-surface-hover [details:has(thead:hover)_&]:bg-theme-surface-hover transition-colors group/summary">
                    
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <a href="${courseLink}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 group/link" onclick="event.stopPropagation()">
                            <h2 class="text-lg font-extrabold text-theme-text-main tracking-tight flex items-center gap-2 transition-colors group-hover/link:text-theme-accent-main">
                                ${course.course_prefix} ${course.course_number}
                            </h2>
                            <h3 class="text-[15px] text-theme-text-muted font-medium transition-colors group-hover/link:text-theme-accent-hover">
                                ${course.course_title || "Unknown Title"}
                            </h3>
                        </a>

                        <div class="flex items-center justify-between md:justify-end w-full md:w-auto gap-4 shrink-0">
                            <span class="px-3 py-1 rounded-md border text-xs font-bold uppercase tracking-wider shadow-sm ${qColor}">${formattedQuarter}</span>
                            <div class="text-theme-text-muted group-open/card:rotate-180 transition-transform duration-200 shrink-0 bg-theme-surface border border-theme-border rounded p-1 shadow-sm group-hover/summary:bg-theme-surface-alt [details:has(thead:hover)_&]:bg-theme-surface-alt">
                                <i data-lucide="chevron-down" class="w-4 h-4"></i>
                            </div>
                        </div>
                    </div>

                    ${(hasReqs || course.notes) ? `
                        <div class="hidden group-open/card:flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2">
                            ${course.has_prerequisites ? `
                                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 border rounded text-[10px] font-bold uppercase tracking-wider tag-red" title="Prerequisites Required">
                                    <i data-lucide="alert-circle" class="w-3 h-3"></i> PREREQS
                                </span>
                            ` : ''}
                            ${course.gen_ed_reqs.map(req => `
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

    _createUnifiedCourseCard(course, prefixToMajorCode = {}) {
        const code = prefixToMajorCode[course.course_prefix] || course.course_prefix; 
        const slug = code.replace(/\s+/g, '').toLowerCase(); 
        const anchor = `${course.course_prefix.replace(/\s+/g, '').toLowerCase()}${course.course_number}`;
        const courseLink = `https://www.washington.edu/students/crscat/${slug}.html#${anchor}`;

        // 1. Generate the term switcher buttons 
        const termButtonsHtml = course.terms.map((term, index) => {
            const qColor = getQuarterColorClasses(term.formatted_quarter);
            // First button is active by default. Removed ring-offset classes to make it flush.
            const activeClasses = `ring-2 ring-current font-extrabold shadow-sm`;
            const inactiveClasses = `opacity-50 hover:opacity-80 font-medium`;
            const stateClasses = index === 0 ? activeClasses : inactiveClasses;
            
            return `
                <button class="unified-term-btn shrink-0 whitespace-nowrap px-3 py-1 rounded border text-xs tracking-wider transition-all ${qColor} ${stateClasses}" data-term-index="${index}" data-qcolor="${qColor}">
                    ${term.formatted_quarter}
                </button>
            `;
        }).join('');

        // 2. The default active term to display in the right-hand badge
        const defaultTermText = course.terms[0].formatted_quarter;
        const defaultTermColor = getQuarterColorClasses(defaultTermText);

        // 3. NEW: Generate the dynamic summary blocks for each term
        const requirementsHtml = `
            <div class="hidden group-open/card:block mt-2">
                ${course.terms.map((term, index) => {
                    const termHasReqs = term.has_prerequisites || (term.gen_ed_reqs && term.gen_ed_reqs.length > 0);
                    
                    // Generate an empty hidden div if there's no info, so the JS index syncing doesn't break
                    if (!termHasReqs && !term.notes) {
                        return `<div class="term-summary-info hidden" data-term-content="${index}"></div>`;
                    }
                    
                    const displayClass = index === 0 ? 'flex' : 'hidden';
                    
                    return `
                        <div class="term-summary-info ${displayClass} flex-wrap items-center gap-x-2 gap-y-1.5" data-term-content="${index}">
                            ${term.has_prerequisites ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 border rounded text-[10px] font-bold uppercase tracking-wider tag-red" title="Prerequisites Required"><i data-lucide="alert-circle" class="w-3 h-3"></i> PREREQS</span>` : ''}
                            ${term.gen_ed_reqs.map(req => `<span class="inline-flex items-center px-1.5 py-0.5 border rounded text-[10px] font-bold tracking-wider tag-indigo" title="General Education Requirement">${req}</span>`).join('')}
                            ${term.notes ? `<span class="flex items-center gap-1.5 text-[11px] text-theme-text-muted font-medium ml-1"><i data-lucide="info" class="w-3.5 h-3.5 opacity-70 shrink-0"></i><span class="leading-relaxed">${term.notes}</span></span>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        // 4. Generate multiple tbodys, hiding all but the first
        const tbodysHtml = course.terms.map((term, index) => {
            const sectionRowsHtml = term.sections.map(sec => this._createSectionRow(sec)).join('');
            const hiddenClass = index === 0 ? '' : 'hidden';
            return `
                <tbody class="term-tbody ${hiddenClass}" data-term-content="${index}">
                    ${sectionRowsHtml}
                </tbody>
            `;
        }).join('');

        return `
            <details class="course-card group/card bg-theme-surface border border-theme-border rounded-lg shadow-sm overflow-hidden mb-4">
                <summary class="cursor-pointer px-4 pt-4 pb-4 group-open/card:pb-1.5 border-b border-theme-border group-open/card:border-b-0 bg-theme-surface hover:bg-theme-surface-hover [details:has(thead:hover)_&]:bg-theme-surface-hover transition-colors group/summary">
                    <div class="flex flex-col gap-3 w-full">
                        
                        <div class="flex items-start justify-between gap-4">
                            
                            <div class="flex-1 min-w-0 flex items-center">
                                <a href="${courseLink}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 group/link w-fit max-w-full" onclick="event.stopPropagation()">
                                    <h2 class="text-lg font-extrabold text-theme-text-main tracking-tight flex items-center gap-2 transition-colors group-hover/link:text-theme-accent-main shrink-0">
                                        ${course.course_prefix} ${course.course_number}
                                    </h2>
                                    <h3 class="text-[15px] text-theme-text-muted font-medium transition-colors group-hover/link:text-theme-accent-hover truncate">
                                        ${course.course_title || "Unknown Title"}
                                    </h3>
                                </a>
                            </div>
                            
                            <div class="flex items-center gap-4 shrink-0 mt-0.5">
                                <span class="unified-active-term-badge px-3 py-1 rounded-md border text-xs font-bold uppercase tracking-wider shadow-sm ${defaultTermColor}">${defaultTermText}</span>
                                <div class="text-theme-text-muted group-open/card:rotate-180 transition-transform duration-200 shrink-0 bg-theme-surface border border-theme-border rounded p-1 shadow-sm group-hover/summary:bg-theme-surface-alt [details:has(thead:hover)_&]:bg-theme-surface-alt">
                                    <i data-lucide="chevron-down" class="w-4 h-4"></i>
                                </div>
                            </div>
                        </div>

                        <div class="flex overflow-x-auto gap-2 pb-3 pt-1 px-1 -ml-1 w-full">
                            ${termButtonsHtml}
                        </div>
                    </div>

                    ${requirementsHtml}
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
                            ${tbodysHtml}
                        </table>
                    </div>
                </div>
            </details>
        `;
    }

    renderCourses(courses, totalMatches, append = false, prefixToMajorCode = {}, isUnified = false) {
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

        const html = courses.map(course => {
            return isUnified 
                ? this._createUnifiedCourseCard(course, prefixToMajorCode)
                : this._createCourseCard(course, prefixToMajorCode);
        }).join('');

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