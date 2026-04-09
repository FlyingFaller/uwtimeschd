import { DatabaseManager } from './database.js';
import { UIManager } from './ui.js';

class App {
    constructor() {
        // this.db = new DatabaseManager("data/schedules.db");
        this.db = new DatabaseManager("data/config.json");
        this.ui = new UIManager();
        
        this.searchInput = document.getElementById('omni-search');
        this.searchBtn = document.getElementById('search-btn');
        this.sortSelect = document.getElementById('sort-select');
        this.loadAllToggle = document.getElementById('load-all-toggle');
        this.resetBtn = document.getElementById('reset-filters-btn');
        
        this.currentQuery = '';
        this.isExpanded = false; 
        
        // Pagination State
        this.currentAllIds = [];
        this.currentOffset = 0;
        this.currentSortBy = 'newest';
        this.isLoadingMore = false;
        this.observer = null;

        this.bindEvents();
    }

    _getQuarterStyles(quarter) {
        if (quarter === 'WIN') return ['bg-[#99ccff]', 'text-blue-900', 'border-blue-300'];
        if (quarter === 'SPR') return ['bg-[#ccffcc]', 'text-green-900', 'border-green-300'];
        if (quarter === 'SUM') return ['bg-[#ffffcc]', 'text-yellow-900', 'border-yellow-300'];
        if (quarter === 'AUT') return ['bg-[#ffcccc]', 'text-red-900', 'border-red-300'];
        return [];
    }

    bindEvents() {
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.markSearchReady());
            this.searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !this.searchBtn.disabled) this.executeSearch();
            });
        }
        
        if (this.searchBtn) {
            this.searchBtn.addEventListener('click', () => this.executeSearch());
        }

        if (this.resetBtn) {
            this.resetBtn.addEventListener('click', () => this.resetFilters());
        }

        const expandBtn = document.getElementById('expand-all-btn');
        const collapseBtn = document.getElementById('collapse-all-btn');
        
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                this.isExpanded = true;
                this.ui.toggleAll(true);
            });
        }
        
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                this.isExpanded = false;
                this.ui.toggleAll(false);
            });
        }

        if (this.sortSelect) {
            this.sortSelect.addEventListener('change', () => this.markSearchReady());
        }
        
        if (this.loadAllToggle) {
            this.loadAllToggle.addEventListener('change', () => this.executeSearch());
        }

        const inputIds = [
            'min-credits', 'max-credits', 'start-time', 'end-time', 
            'start-year', 'start-quarter', 'end-year', 'end-quarter', 'time-scope'
        ];
        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.markSearchReady());
        });

        // Dynamic Quarter Dropdown Colors for Term Range Filter
        ['start-quarter', 'end-quarter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', (e) => this.updateQuarterColor(e.target));
            }
        });

        document.querySelectorAll('.type-checkbox').forEach(cb => {
            cb.addEventListener('change', () => this.markSearchReady());
        });

        document.getElementById('clear-majors').addEventListener('click', () => {
            const majorCheckboxes = document.querySelectorAll('.major-checkbox');
            majorCheckboxes.forEach(box => {
                box.checked = box.value === 'ALL';
            });
            this.markSearchReady();
        });

        const modeBtns = document.querySelectorAll('.mode-btn');
        const modeDesc = document.getElementById('day-mode-desc');
        modeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                modeBtns.forEach(b => {
                    b.classList.remove('bg-white', 'shadow-sm', 'text-slate-700', 'active');
                    b.classList.add('text-slate-500');
                });
                const target = e.target;
                target.classList.remove('text-slate-500');
                target.classList.add('bg-white', 'shadow-sm', 'text-slate-700', 'active');
                
                if (target.dataset.mode === 'include') {
                    modeDesc.textContent = "Must meet on ALL selected days";
                } else {
                    modeDesc.textContent = "Cannot meet on ANY selected day";
                }
                this.markSearchReady();
            });
        });

        const tbaBtns = document.querySelectorAll('.tba-btn');
        tbaBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                tbaBtns.forEach(b => {
                    b.classList.remove('bg-indigo-100', 'shadow-inner', 'text-indigo-800', 'active');
                    b.classList.add('text-slate-500');
                });
                const target = e.target;
                target.classList.remove('text-slate-500');
                target.classList.add('bg-indigo-100', 'shadow-inner', 'text-indigo-800', 'active');
                this.markSearchReady();
            });
        });

        // NEW: Quarter Filtering Buttons (Color toggling)
        document.querySelectorAll('.quarter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const t = e.target;
                const q = t.dataset.quarter;
                const activeStyles = this._getQuarterStyles(q);
                const defaultStyles = ['bg-white', 'text-slate-600', 'border-slate-300', 'hover:bg-slate-50'];
                
                t.classList.toggle('active');
                
                if (t.classList.contains('active')) {
                    t.classList.remove(...defaultStyles);
                    t.classList.add(...activeStyles);
                } else {
                    t.classList.remove(...activeStyles);
                    t.classList.add(...defaultStyles);
                }
                
                this.markSearchReady();
            });
        });

        // Other generic filter buttons/chips
        document.querySelectorAll('.filter-btn, .filter-chip').forEach(btn => {
            if (btn.classList.contains('quarter-btn')) return; // handled above

            btn.addEventListener('click', (e) => {
                const t = e.target;
                t.classList.toggle('active');
                
                if (t.classList.contains('active')) {
                    t.classList.remove('border-slate-300', 'text-slate-600', 'bg-white', 'hover:bg-slate-50', 'hover:bg-slate-100');
                    t.classList.add('border-purple-300', 'bg-purple-50', 'text-purple-700');
                } else {
                    t.classList.add('border-slate-300', 'text-slate-600', 'bg-white');
                    t.classList.remove('border-purple-300', 'bg-purple-50', 'text-purple-700');
                    if (t.classList.contains('filter-chip')) t.classList.add('hover:bg-slate-100');
                    if (t.classList.contains('filter-btn')) t.classList.add('hover:bg-slate-50');
                }
                
                this.markSearchReady();
            });
        });
    }

    resetFilters() {
        // 1. Text & Numeric Inputs
        if (this.searchInput) this.searchInput.value = '';
        
        const ids = [
            'min-credits', 'max-credits', 'start-time', 'end-time', 
            'start-year', 'start-quarter', 'end-year', 'end-quarter'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        // 2. Selects & Toggles
        if (this.sortSelect) this.sortSelect.value = 'newest';
        if (this.loadAllToggle) this.loadAllToggle.checked = false;
        
        const timeScope = document.getElementById('time-scope');
        if (timeScope) timeScope.value = 'primary';

        // Clear quarter dropdown colors
        ['start-quarter', 'end-quarter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.updateQuarterColor(el);
        });

        // 3. Checkboxes
        document.querySelectorAll('.type-checkbox').forEach(cb => cb.checked = false);
        document.querySelectorAll('.major-checkbox').forEach(cb => {
            cb.checked = cb.value === 'ALL';
        });

        // 4. Custom Filter Buttons (Active States)
        document.querySelectorAll('.filter-btn, .filter-chip').forEach(t => {
            if (t.classList.contains('quarter-btn')) return; // handled separately
            t.classList.remove('active', 'border-purple-300', 'bg-purple-50', 'text-purple-700');
            t.classList.add('border-slate-300', 'text-slate-600', 'bg-white');
            if (t.classList.contains('filter-chip')) t.classList.add('hover:bg-slate-100');
            if (t.classList.contains('filter-btn')) t.classList.add('hover:bg-slate-50');
        });

        // Quarter Buttons Reset
        document.querySelectorAll('.quarter-btn').forEach(t => {
            const q = t.dataset.quarter;
            const activeStyles = this._getQuarterStyles(q);
            t.classList.remove('active', ...activeStyles);
            t.classList.add('bg-white', 'text-slate-600', 'border-slate-300', 'hover:bg-slate-50');
        });

        // 5. Day Mode Reset
        const modeBtns = document.querySelectorAll('.mode-btn');
        const modeDesc = document.getElementById('day-mode-desc');
        modeBtns.forEach(btn => {
            if (btn.dataset.mode === 'include') {
                btn.classList.add('bg-white', 'shadow-sm', 'text-slate-700', 'active');
                btn.classList.remove('text-slate-500');
                if (modeDesc) modeDesc.textContent = "Must meet on ALL selected days";
            } else {
                btn.classList.remove('bg-white', 'shadow-sm', 'text-slate-700', 'active');
                btn.classList.add('text-slate-500');
            }
        });

        // 6. TBA Reset
        const tbaBtns = document.querySelectorAll('.tba-btn');
        tbaBtns.forEach(btn => {
            if (btn.dataset.tba === 'include') {
                btn.classList.add('bg-indigo-100', 'shadow-inner', 'text-indigo-800', 'active');
                btn.classList.remove('text-slate-500');
            } else {
                btn.classList.remove('bg-indigo-100', 'shadow-inner', 'text-indigo-800', 'active');
                btn.classList.add('text-slate-500');
            }
        });

        // 7. Reset Internal State & Clear UI
        this.currentQuery = '';
        this.currentAllIds = [];
        this.currentOffset = 0;
        if (this.observer) this.observer.disconnect();

        this.ui.container.innerHTML = `
            <div class="text-center py-20 bg-white rounded-lg border border-slate-200">
                <i data-lucide="info" class="w-12 h-12 text-slate-300 mx-auto mb-3"></i>
                <h3 class="text-lg font-medium text-slate-900">Filters Reset</h3>
                <p class="text-slate-500 text-sm mt-1">Enter a search term or select filters to see results.</p>
            </div>`;
        if (window.lucide) lucide.createIcons();
        
        if (this.ui.resultCount) this.ui.resultCount.textContent = '0';
        
        if (this.searchBtn) {
            this.searchBtn.disabled = true;
            this.searchBtn.classList.add('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
            this.searchBtn.classList.remove('bg-purple-600', 'text-white', 'hover:bg-purple-700', 'shadow-md');
        }
    }

    updateQuarterColor(selectEl) {
        const val = selectEl.value;
        if (val === 'AUT') selectEl.style.backgroundColor = '#ffcccc';
        else if (val === 'WIN') selectEl.style.backgroundColor = '#99ccff';
        else if (val === 'SPR') selectEl.style.backgroundColor = '#ccffcc';
        else if (val === 'SUM') selectEl.style.backgroundColor = '#ffffcc';
        else selectEl.style.backgroundColor = '';
    }

    bindMajorEvents() {
        const majorCheckboxes = document.querySelectorAll('.major-checkbox');
        majorCheckboxes.forEach(cb => {
            cb.addEventListener('change', (e) => {
                const target = e.target;
                if (target.value === 'ALL' && target.checked) {
                    majorCheckboxes.forEach(box => { if (box.value !== 'ALL') box.checked = false; });
                } else if (target.value !== 'ALL' && target.checked) {
                    const allBox = document.querySelector('.major-checkbox[value="ALL"]');
                    if (allBox) allBox.checked = false;
                }
                this.markSearchReady();
            });
        });
    }

    async populateDynamicMajors() {
        try {
            const majors = await this.db.getUniqueMajors();
            
            const clearBtn = document.getElementById('clear-majors');
            const container = clearBtn.parentElement.parentElement.querySelector('.max-h-36');
            
            let html = `<label class="flex items-center gap-2 cursor-pointer hover:bg-slate-200 p-1 rounded transition-colors"><input type="checkbox" class="accent-purple-600 major-checkbox" value="ALL" checked> All Departments</label>`;
            
            majors.forEach(m => {
                const displayName = m.name ? `${m.prefix} - ${m.name}` : m.prefix;
                html += `<label class="flex items-center gap-2 cursor-pointer hover:bg-slate-200 p-1 rounded transition-colors"><input type="checkbox" class="accent-purple-600 major-checkbox" value="${m.prefix}"> ${displayName}</label>`;
            });

            container.innerHTML = html;
            this.bindMajorEvents();
            
            const majorFilterInput = clearBtn.parentElement.parentElement.querySelector('input[type="text"]');
            if (majorFilterInput) {
                majorFilterInput.addEventListener('input', (e) => {
                    const term = e.target.value.toLowerCase();
                    const labels = container.querySelectorAll('label');
                    labels.forEach(label => {
                        if (label.querySelector('input').value === 'ALL' || label.textContent.toLowerCase().includes(term)) {
                            label.style.display = 'flex';
                        } else {
                            label.style.display = 'none';
                        }
                    });
                });
            }

        } catch (error) {
            console.error("Failed to load dynamic majors:", error);
        }
    }

    _getTermCode(yearStr, quarterStr, isStartBound) {
        if (!yearStr) return null;
        const year = parseInt(yearStr);
        if (isNaN(year)) return null;
        
        const weights = { "WIN": 1, "SPR": 2, "SUM": 3, "AUT": 4 };
        let qWeight = quarterStr ? weights[quarterStr.toUpperCase()] : null;
        
        if (!qWeight) {
            qWeight = isStartBound ? 1 : 4; 
        }
        return parseInt(`${year}${qWeight}`);
    }

    harvestFilters() {
        const getCheckedValues = (selector) => Array.from(document.querySelectorAll(selector)).map(cb => cb.value || cb.dataset.type || cb.dataset.level);
        const getInputValue = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        const attributes = Array.from(document.querySelectorAll('.filter-chip.active')).map(btn => btn.dataset.attr);
        const activeDays = Array.from(document.querySelectorAll('.day-btn.active')).map(btn => btn.dataset.day);
        const activeLevels = Array.from(document.querySelectorAll('.level-btn.active')).map(btn => btn.dataset.level);
        const activeSectionTypes = Array.from(document.querySelectorAll('.type-checkbox:checked')).map(cb => cb.dataset.type);
        const activeQuarters = Array.from(document.querySelectorAll('.quarter-btn.active')).map(btn => btn.dataset.quarter);
        
        const activeMajors = Array.from(document.querySelectorAll('.major-checkbox:checked'))
                                  .map(cb => cb.value)
                                  .filter(val => val !== 'ALL');
        
        const dayModeBtn = document.querySelector('.mode-btn.active');
        const dayMode = dayModeBtn ? dayModeBtn.dataset.mode : 'include';

        const tbaBtn = document.querySelector('.tba-btn.active');
        const tbaMode = tbaBtn ? tbaBtn.dataset.tba : 'include';

        const startYear = getInputValue('start-year');
        const startQuarter = getInputValue('start-quarter');
        const endYear = getInputValue('end-year');
        const endQuarter = getInputValue('end-quarter');

        return {
            majors: activeMajors,
            attributes: attributes,
            daysInclude: dayMode === 'include' ? activeDays : [],
            daysExclude: dayMode === 'exclude' ? activeDays : [],
            quarters: activeQuarters, // Handing over to SQL
            tbaMode: tbaMode,
            levels: activeLevels,
            sectionTypes: activeSectionTypes,
            minCredits: getInputValue('min-credits'),
            maxCredits: getInputValue('max-credits'),
            minTermCode: this._getTermCode(startYear, startQuarter, true),
            maxTermCode: this._getTermCode(endYear, endQuarter, false),
            timeScope: getInputValue('time-scope') || 'primary',
            startTime: getInputValue('start-time'),
            endTime: getInputValue('end-time'),
            sortBy: this.sortSelect ? this.sortSelect.value : 'newest'
        };
    }

    markSearchReady() {
        if (!this.searchBtn) return;
        this.searchBtn.disabled = false;
        this.searchBtn.classList.remove('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
        this.searchBtn.classList.add('bg-purple-600', 'text-white', 'hover:bg-purple-700', 'shadow-md');
    }

    async init() {
        if (window.lucide) lucide.createIcons();
        try {
            await this.db.init();
            this.ui.setReadyStatus();
            
            await this.populateDynamicMajors();
            
            if (this.searchInput) {
                this.searchInput.disabled = false;
                this.searchInput.value = ""; 
            }

        } catch (error) {
            this.ui.setErrorStatus("DB Connection Failed");
            console.error(error);
        }
    }

    async executeSearch() {
        this.currentQuery = this.searchInput ? this.searchInput.value.trim() : '';
        
        if (this.searchBtn) {
            this.searchBtn.disabled = true;
            this.searchBtn.classList.add('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
            this.searchBtn.classList.remove('bg-purple-600', 'text-white', 'hover:bg-purple-700', 'shadow-md');
        }
        
        this.ui.showLoading();
        
        try {
            const activeFilters = this.harvestFilters();
            this.currentSortBy = activeFilters.sortBy || 'newest';
            
            const bypassChunking = this.loadAllToggle ? this.loadAllToggle.checked : false;
            const limit = bypassChunking ? 'all' : 25;

            const results = await this.db.searchCourses(this.currentQuery, activeFilters, limit);
            
            const uniqueIds = [...new Set(results.allIds || [])];
            results.allIds = uniqueIds;
            results.totalMatches = uniqueIds.length;

            this.currentAllIds = uniqueIds;
            this.currentOffset = limit === 'all' ? this.currentAllIds.length : 25;
            
            this.ui.renderCourses(results, false); 
            this.setupObserver();
            
            if (this.isExpanded) {
                this.ui.toggleAll(true);
            } else if (results.length > 0 && results.length <= 3) {
                this.ui.toggleAll(true);
            }
        } catch (error) {
            console.error("Search failed:", error);
            if (this.ui.container) {
                this.ui.container.innerHTML = `<div class="text-red-500 p-8 text-center font-bold">Query Error Occurred.</div>`;
            }
        }
    }

    setupObserver() {
        if (this.observer) this.observer.disconnect();

        const sentinel = document.getElementById('scroll-sentinel');
        if (!sentinel) return;

        this.observer = new IntersectionObserver(async (entries) => {
            const entry = entries[0];
            if (entry.isIntersecting && !this.isLoadingMore && this.currentOffset < this.currentAllIds.length) {
                await this.loadMore();
            }
        }, { rootMargin: '200px' });

        this.observer.observe(sentinel);
    }

    async loadMore() {
        this.isLoadingMore = true;
        this.ui.showLoadingMore(true);

        try {
            const nextIds = this.currentAllIds.slice(this.currentOffset, this.currentOffset + 25);
            const nextResults = await this.db.hydrateCourses(nextIds, this.currentSortBy);
            
            this.currentOffset += 25;
            this.ui.renderCourses(nextResults, true); 
            
            if (this.isExpanded) this.ui.toggleAll(true);
            
            this.setupObserver();
        } catch (error) {
            console.error("Hydration failed:", error);
        } finally {
            this.isLoadingMore = false;
            this.ui.showLoadingMore(false);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});