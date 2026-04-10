import { DatabaseManager } from './database.js';
import { UIManager } from './ui.js';

class App {
    constructor() {
        this.db = new DatabaseManager("data/config.json");
        this.ui = new UIManager();
        
        this.searchInput = document.getElementById('omni-search');
        this.searchBtn = document.getElementById('search-btn');
        this.sortSelect = document.getElementById('sort-select');
        this.loadAllToggle = document.getElementById('load-all-toggle');
        this.resetBtn = document.getElementById('reset-filters-btn');
        
        this.currentQuery = '';
        this.isExpanded = false; 
        
        this.currentAllIds = [];
        this.currentOffset = 0;
        this.currentSortBy = 'newest';
        this.isLoadingMore = false;
        this.observer = null;

        this.bindEvents();
    }

    bindEvents() {
        // Dark Mode Toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const root = document.documentElement;
                if (root.classList.contains('dark')) {
                    root.classList.replace('dark', 'light');
                } else {
                    root.classList.replace('light', 'dark');
                }
            });
        }

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

        if (this.sortSelect) this.sortSelect.addEventListener('change', () => this.markSearchReady());
        if (this.loadAllToggle) this.loadAllToggle.addEventListener('change', () => this.executeSearch());

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

        // Toggle Events for Day Mode
        const modeBtns = document.querySelectorAll('.mode-btn');
        const modeDesc = document.getElementById('day-mode-desc');
        modeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                modeBtns.forEach(b => {
                    b.classList.remove('bg-theme-surface', 'shadow-sm', 'text-theme-text-main', 'active');
                    b.classList.add('text-theme-text-muted');
                });
                const target = e.target;
                target.classList.remove('text-theme-text-muted');
                target.classList.add('bg-theme-surface', 'shadow-sm', 'text-theme-text-main', 'active');
                
                if (target.dataset.mode === 'include') {
                    modeDesc.textContent = "Must meet on ALL selected days";
                } else {
                    modeDesc.textContent = "Cannot meet on ANY selected day";
                }
                this.markSearchReady();
            });
        });

        // Toggle Events for TBA Mode
        const tbaBtns = document.querySelectorAll('.tba-btn');
        tbaBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                tbaBtns.forEach(b => {
                    b.classList.remove('bg-theme-surface', 'shadow-sm', 'text-theme-text-main', 'active');
                    b.classList.add('text-theme-text-muted');
                });
                const target = e.target;
                target.classList.remove('text-theme-text-muted');
                target.classList.add('bg-theme-surface', 'shadow-sm', 'text-theme-text-main', 'active');
                this.markSearchReady();
            });
        });

        // Semantic Toggle for Quarter Buttons
        document.querySelectorAll('.quarter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const t = e.target;
                const q = t.dataset.quarter;
                const qClass = `badge-${q.toLowerCase()}`;
                
                // Removed 'hover:bg-theme-surface-hover' to not overwrite custom CSS hover states
                const defaultStyles = ['bg-theme-surface', 'text-theme-text-main', 'border-theme-border'];
                
                t.classList.toggle('active');
                
                if (t.classList.contains('active')) {
                    t.classList.remove(...defaultStyles);
                    t.classList.add(qClass);
                } else {
                    t.classList.remove(qClass);
                    t.classList.add(...defaultStyles);
                }
                
                this.markSearchReady();
            });
        });

        // Semantic Toggle for Generic Filter Chips
        document.querySelectorAll('.filter-btn, .filter-chip').forEach(btn => {
            if (btn.classList.contains('quarter-btn')) return;

            btn.addEventListener('click', (e) => {
                const t = e.target;
                t.classList.toggle('active');
                
                if (t.classList.contains('active')) {
                    t.classList.remove('border-theme-border', 'text-theme-text-main', 'bg-theme-surface', 'hover:bg-theme-surface-hover');
                    t.classList.add('border-theme-accent-main', 'bg-theme-accent-bg', 'text-theme-accent-text');
                } else {
                    t.classList.add('border-theme-border', 'text-theme-text-main', 'bg-theme-surface', 'hover:bg-theme-surface-hover');
                    t.classList.remove('border-theme-accent-main', 'bg-theme-accent-bg', 'text-theme-accent-text');
                }
                
                this.markSearchReady();
            });
        });
    }

    resetFilters() {
        if (this.searchInput) this.searchInput.value = '';
        
        const ids = [
            'min-credits', 'max-credits', 'start-time', 'end-time', 
            'start-year', 'start-quarter', 'end-year', 'end-quarter'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        if (this.sortSelect) this.sortSelect.value = 'newest';
        if (this.loadAllToggle) this.loadAllToggle.checked = false;
        
        const timeScope = document.getElementById('time-scope');
        if (timeScope) timeScope.value = 'primary';

        // Clear quarter dropdown colors properly
        ['start-quarter', 'end-quarter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.updateQuarterColor(el);
        });

        document.querySelectorAll('.type-checkbox').forEach(cb => cb.checked = false);
        document.querySelectorAll('.major-checkbox').forEach(cb => {
            cb.checked = cb.value === 'ALL';
        });

        // Reset Filter Chips
        document.querySelectorAll('.filter-btn, .filter-chip').forEach(t => {
            if (t.classList.contains('quarter-btn')) return;
            t.classList.remove('active', 'border-theme-accent-main', 'bg-theme-accent-bg', 'text-theme-accent-text');
            t.classList.add('border-theme-border', 'text-theme-text-main', 'bg-theme-surface', 'hover:bg-theme-surface-hover');
        });

        // Reset Quarter Buttons
        document.querySelectorAll('.quarter-btn').forEach(t => {
            const qClass = `badge-${t.dataset.quarter.toLowerCase()}`;
            t.classList.remove('active', qClass);
            t.classList.add('bg-theme-surface', 'text-theme-text-main', 'border-theme-border');
        });

        // Reset Mode Toggles
        const modeBtns = document.querySelectorAll('.mode-btn');
        const modeDesc = document.getElementById('day-mode-desc');
        modeBtns.forEach(btn => {
            if (btn.dataset.mode === 'include') {
                btn.classList.add('bg-theme-surface', 'shadow-sm', 'text-theme-text-main', 'active');
                btn.classList.remove('text-theme-text-muted');
                if (modeDesc) modeDesc.textContent = "Must meet on ALL selected days";
            } else {
                btn.classList.remove('bg-theme-surface', 'shadow-sm', 'text-theme-text-main', 'active');
                btn.classList.add('text-theme-text-muted');
            }
        });

        const tbaBtns = document.querySelectorAll('.tba-btn');
        tbaBtns.forEach(btn => {
            if (btn.dataset.tba === 'include') {
                btn.classList.add('bg-theme-surface', 'shadow-sm', 'text-theme-text-main', 'active');
                btn.classList.remove('text-theme-text-muted');
            } else {
                btn.classList.remove('bg-theme-surface', 'shadow-sm', 'text-theme-text-main', 'active');
                btn.classList.add('text-theme-text-muted');
            }
        });

        // Reset Internals
        this.currentQuery = '';
        this.currentAllIds = [];
        this.currentOffset = 0;
        if (this.observer) this.observer.disconnect();

        this.ui.container.innerHTML = `
            <div class="text-center py-20">
                <i data-lucide="info" class="w-12 h-12 text-theme-text-muted mx-auto mb-3"></i>
                <h3 class="text-lg font-medium text-theme-text-main">Filters Reset</h3>
                <p class="text-theme-text-muted text-sm mt-1">Enter a search term or select filters to see results.</p>
            </div>`;
        if (window.lucide) lucide.createIcons();
        
        if (this.ui.resultCount) this.ui.resultCount.textContent = '0';
        
        if (this.searchBtn) {
            this.searchBtn.disabled = true;
            this.searchBtn.classList.add('bg-theme-border', 'text-theme-text-muted', 'cursor-not-allowed');
            this.searchBtn.classList.remove('bg-theme-accent-main', 'text-theme-text-inverse', 'hover:bg-theme-accent-hover', 'shadow-md');
        }
    }

    updateQuarterColor(selectEl) {
        const val = selectEl.value;
        const qClasses = ['badge-aut', 'badge-win', 'badge-spr', 'badge-sum'];
        const defaultClasses = ['bg-theme-surface', 'text-theme-text-main'];
        
        // Strip off all active quarter and default classes first to avoid conflicts
        selectEl.classList.remove(...qClasses, ...defaultClasses);
        
        if (val && val !== '') {
            selectEl.classList.add(`badge-${val.toLowerCase()}`);
        } else {
            selectEl.classList.add(...defaultClasses);
        }
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
            
            let html = `<label class="flex items-center gap-2 cursor-pointer hover:bg-theme-surface-hover p-1 rounded transition-colors"><input type="checkbox" class="accent-theme-accent-main major-checkbox" value="ALL" checked> All Departments</label>`;
            
            majors.forEach(m => {
                const displayName = m.name ? `${m.prefix} - ${m.name}` : m.prefix;
                html += `<label class="flex items-center gap-2 cursor-pointer hover:bg-theme-surface-hover p-1 rounded transition-colors"><input type="checkbox" class="accent-theme-accent-main major-checkbox" value="${m.prefix}"> ${displayName}</label>`;
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
            quarters: activeQuarters,
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
        this.searchBtn.classList.remove('bg-theme-border', 'text-theme-text-muted', 'cursor-not-allowed');
        this.searchBtn.classList.add('bg-theme-accent-main', 'text-theme-text-inverse', 'hover:bg-theme-accent-hover', 'shadow-md');
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
            this.searchBtn.classList.add('bg-theme-border', 'text-theme-text-muted', 'cursor-not-allowed');
            this.searchBtn.classList.remove('bg-theme-accent-main', 'text-theme-text-inverse', 'hover:bg-theme-accent-hover', 'shadow-md');
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
                this.ui.container.innerHTML = `<div class="text-theme-status-err p-8 text-center font-bold">Query Error Occurred.</div>`;
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