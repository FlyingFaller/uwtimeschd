import { DatabaseManager } from './database.js';
import { UIManager } from './ui.js';
import { AppStore } from './store.js';
import { CourseService } from './service.js';

class App {
    constructor() {
        this.db = new DatabaseManager("data/config.json");
        this.ui = new UIManager();
        this.store = new AppStore();
        
        this.currentSearchController = null; // Used for Race Condition Prevention
        
        // Centralized DOM Element Caching
        this.dom = {
            searchInput   : document.getElementById('omni-search'),
            searchBtn     : document.getElementById('search-btn'),
            sortSelect    : document.getElementById('sort-select'),
            loadAllToggle : document.getElementById('load-all-toggle'),
            resetBtn      : document.getElementById('reset-filters-btn'),
            themeToggle   : document.getElementById('theme-toggle'),
            expandBtn     : document.getElementById('expand-all-btn'),
            collapseBtn   : document.getElementById('collapse-all-btn'),
            sidebar       : document.querySelector('aside'),
            timeScope     : document.getElementById('time-scope'),
            modeDesc      : document.getElementById('day-mode-desc'),
            clearMajorsBtn: document.getElementById('clear-majors'),
            filterInputs  : [
                'min-credits', 'max-credits', 'start-time', 'end-time', 
                'start-year', 'start-quarter', 'end-year', 'end-quarter'
            ]
        };

        this.initEvents();
    }

    initEvents() {
        this._bindThemeToggle();
        this._bindSearchControls();
        this._bindSidebarDelegation();
        this._bindInputListeners();
    }

    _bindThemeToggle() {
        if (this.dom.themeToggle) {
            this.dom.themeToggle.addEventListener('click', () => {
                const root = document.documentElement;
                root.classList.toggle('dark');
                root.classList.toggle('light');
            });
        }
    }

    _bindSearchControls() {
        if (this.dom.searchInput) {
            this.dom.searchInput.addEventListener('input', (e) => {
                this.store.setFilter('query', e.target.value);
                this.markSearchReady();
            });
            this.dom.searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !this.dom.searchBtn.disabled) this.executeSearch();
            });
        }
        
        if (this.dom.searchBtn) {
            this.dom.searchBtn.addEventListener('click', () => this.executeSearch());
        }

        if (this.dom.resetBtn) {
            this.dom.resetBtn.addEventListener('click', () => this.resetFilters());
        }

        if (this.dom.expandBtn) {
            this.dom.expandBtn.addEventListener('click', () => {
                this.store.state.isExpanded = true;
                this.ui.toggleAll(true);
            });
        }
        
        if (this.dom.collapseBtn) {
            this.dom.collapseBtn.addEventListener('click', () => {
                this.store.state.isExpanded = false;
                this.ui.toggleAll(false);
            });
        }

        if (this.dom.sortSelect) {
            this.dom.sortSelect.addEventListener('change', (e) => {
                this.store.setFilter('sortBy', e.target.value);
                this.markSearchReady();
            });
        }

        if (this.dom.loadAllToggle) {
            this.dom.loadAllToggle.addEventListener('change', (e) => {
                this.store.setFilter('loadAll', e.target.checked);
                this.executeSearch();
            });
        }
    }

    _bindInputListeners() {
        // Sync Store on text/number inputs
        this.dom.filterInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    // map HTML id (min-credits) to store key (minCredits)
                    const key = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                    this.store.setFilter(key, e.target.value);
                    this.markSearchReady();
                });
            }
        });
        
        if (this.dom.timeScope) {
            this.dom.timeScope.addEventListener('change', (e) => {
                this.store.setFilter('timeScope', e.target.value);
                this.markSearchReady();
            });
        }

        // Quarter Dropdown Colors
        ['start-quarter', 'end-quarter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', (e) => this.updateQuarterColor(e.target));
        });
        
        // Clear Majors
        if (this.dom.clearMajorsBtn) {
            this.dom.clearMajorsBtn.addEventListener('click', () => {
                document.querySelectorAll('.major-checkbox').forEach(box => {
                    box.checked = box.value === 'ALL';
                });
                this.store.setFilter('majors', []);
                this.markSearchReady();
            });
        }
    }

    _bindSidebarDelegation() {
        // Handle Button Clicks
        this.dom.sidebar.addEventListener('click', (e) => {
            const target = e.target;

            // 1. Semantic Toggle for Quarter Buttons
            if (target.closest('.quarter-btn')) {
                const btn = target.closest('.quarter-btn');
                this._toggleQuarterButton(btn);
                this.store.toggleArrayFilter('quarters', btn.dataset.quarter);
                this.markSearchReady();
            }
            // 2. Filter Chips and Level Buttons
            else if (target.closest('.filter-btn:not(.quarter-btn), .filter-chip')) {
                const btn = target.closest('.filter-btn:not(.quarter-btn), .filter-chip');
                this._toggleFilterButton(btn);
                
                if (btn.classList.contains('day-btn')) {
                    const currentMode = document.querySelector('.mode-btn.active')?.dataset.mode || 'include';
                    this.store.toggleArrayFilter(currentMode === 'include' ? 'daysInclude' : 'daysExclude', btn.dataset.day);
                }
                else if (btn.classList.contains('level-btn')) this.store.toggleArrayFilter('levels', btn.dataset.level);
                else this.store.toggleArrayFilter('attributes', btn.dataset.attr);
                
                this.markSearchReady();
            }
            // 3. Day Mode Toggle (Include/Exclude)
            else if (target.closest('.mode-btn')) {
                const btn = target.closest('.mode-btn');
                this._handleRadioToggleGroup('.mode-btn', btn);
                const mode = btn.dataset.mode;
                
                if (this.dom.modeDesc) {
                    this.dom.modeDesc.textContent = mode === 'include' ? "Must meet on ALL selected days" : "Cannot meet on ANY selected day";
                }
                
                // Swap the array storage based on mode
                if (mode === 'include') {
                    this.store.setFilter('daysInclude', [...this.store.filters.daysExclude]);
                    this.store.setFilter('daysExclude', []);
                } else {
                    this.store.setFilter('daysExclude', [...this.store.filters.daysInclude]);
                    this.store.setFilter('daysInclude', []);
                }
                this.markSearchReady();
            }
            // 4. TBA Mode Toggle
            else if (target.closest('.tba-btn')) {
                const btn = target.closest('.tba-btn');
                this._handleRadioToggleGroup('.tba-btn', btn);
                this.store.setFilter('tbaMode', btn.dataset.tba);
                this.markSearchReady();
            }
        });

        // Handle Checkbox Changes
        this.dom.sidebar.addEventListener('change', (e) => {
            const target = e.target;
            
            if (target.classList.contains('type-checkbox')) {
                this.store.toggleArrayFilter('sectionTypes', target.dataset.type);
                this.markSearchReady();
            } 
            else if (target.classList.contains('major-checkbox')) {
                this._handleMajorCheckboxChange(target);
                this.markSearchReady();
            }
        });
    }

    _toggleQuarterButton(btn) {
        const qClass = `badge-${btn.dataset.quarter.toLowerCase()}`;
        const defaultStyles = ['bg-theme-surface', 'text-theme-text-main', 'border-theme-border'];
        
        if (btn.classList.toggle('active')) {
            btn.classList.remove(...defaultStyles);
            btn.classList.add(qClass);
        } else {
            btn.classList.remove(qClass);
            btn.classList.add(...defaultStyles);
        }
    }

    _toggleFilterButton(btn) {
        if (btn.classList.toggle('active')) {
            btn.classList.remove('border-theme-border', 'text-theme-text-main', 'bg-theme-surface', 'hover:bg-theme-surface-hover');
            btn.classList.add('border-theme-accent-main', 'bg-theme-accent-bg', 'text-theme-accent-text');
        } else {
            btn.classList.add('border-theme-border', 'text-theme-text-main', 'bg-theme-surface', 'hover:bg-theme-surface-hover');
            btn.classList.remove('border-theme-accent-main', 'bg-theme-accent-bg', 'text-theme-accent-text');
        }
    }

    _handleRadioToggleGroup(selector, activeBtn) {
        document.querySelectorAll(selector).forEach(b => {
            b.classList.remove('bg-theme-surface', 'shadow-sm', 'text-theme-text-main', 'active');
            b.classList.add('text-theme-text-muted');
        });
        activeBtn.classList.remove('text-theme-text-muted');
        activeBtn.classList.add('bg-theme-surface', 'shadow-sm', 'text-theme-text-main', 'active');
    }

    _handleMajorCheckboxChange(target) {
        const majorCheckboxes = document.querySelectorAll('.major-checkbox');
        const allBox = document.querySelector('.major-checkbox[value="ALL"]');
        
        if (target.value === 'ALL' && target.checked) {
            majorCheckboxes.forEach(box => { if (box.value !== 'ALL') box.checked = false; });
            this.store.setFilter('majors', []);
        } else if (target.value !== 'ALL' && target.checked) {
            if (allBox) allBox.checked = false;
            this.store.toggleArrayFilter('majors', target.value);
        } else if (target.value !== 'ALL' && !target.checked) {
             this.store.toggleArrayFilter('majors', target.value);
             
             // Re-check "All Departments" if the last major is unchecked
             if (this.store.filters.majors.length === 0 && allBox) {
                 allBox.checked = true;
             }
        }
    }

    resetFilters() {
        // Reset DOM Inputs
        if (this.dom.searchInput) this.dom.searchInput.value = '';
        if (this.dom.sortSelect) this.dom.sortSelect.value = 'newest';
        if (this.dom.loadAllToggle) this.dom.loadAllToggle.checked = false;
        if (this.dom.timeScope) this.dom.timeScope.value = 'primary';

        this.dom.filterInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        ['start-quarter', 'end-quarter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.updateQuarterColor(el);
        });

        document.querySelectorAll('.type-checkbox').forEach(cb => cb.checked = false);
        document.querySelectorAll('.major-checkbox').forEach(cb => { cb.checked = cb.value === 'ALL'; });

        // Reset Visual Styles
        document.querySelectorAll('.filter-btn, .filter-chip').forEach(t => {
            if (t.classList.contains('quarter-btn')) return;
            t.classList.remove('active', 'border-theme-accent-main', 'bg-theme-accent-bg', 'text-theme-accent-text');
            t.classList.add('border-theme-border', 'text-theme-text-main', 'bg-theme-surface', 'hover:bg-theme-surface-hover');
        });

        document.querySelectorAll('.quarter-btn').forEach(t => {
            t.classList.remove('active', `badge-${t.dataset.quarter.toLowerCase()}`);
            t.classList.add('bg-theme-surface', 'text-theme-text-main', 'border-theme-border');
        });

        const incModeBtn = document.querySelector('.mode-btn[data-mode="include"]');
        if (incModeBtn) this._handleRadioToggleGroup('.mode-btn', incModeBtn);
        if (this.dom.modeDesc) this.dom.modeDesc.textContent = "Must meet on ALL selected days";

        const incTbaBtn = document.querySelector('.tba-btn[data-tba="include"]');
        if (incTbaBtn) this._handleRadioToggleGroup('.tba-btn', incTbaBtn);

        // Reset the Source of Truth
        this.store.reset();
        
        if (this.store.state.observer) this.store.state.observer.disconnect();

        this.ui.renderEmptyResetState();
        
        if (this.dom.searchBtn) {
            this.dom.searchBtn.disabled = true;
            this.dom.searchBtn.classList.add('bg-theme-border', 'text-theme-text-muted', 'cursor-not-allowed');
            this.dom.searchBtn.classList.remove('bg-theme-accent-main', 'text-theme-text-inverse', 'hover:bg-theme-accent-hover', 'shadow-md');
        }
    }

    updateQuarterColor(selectEl) {
        const val = selectEl.value;
        const qClasses = ['badge-aut', 'badge-win', 'badge-spr', 'badge-sum'];
        const defaultClasses = ['bg-theme-surface', 'text-theme-text-main'];
        
        selectEl.classList.remove(...qClasses, ...defaultClasses);
        
        if (val && val !== '') {
            selectEl.classList.add(`badge-${val.toLowerCase()}`);
        } else {
            selectEl.classList.add(...defaultClasses);
        }
    }

    async populateDynamicMajors() {
        try {
            const majors = await this.db.getUniqueMajors();
            const container = this.dom.clearMajorsBtn.parentElement.parentElement.querySelector('.max-h-36');
            
            let html = `<label class="flex items-center gap-2 cursor-pointer hover:bg-theme-surface-hover p-1 rounded transition-colors"><input type="checkbox" class="accent-theme-accent-main major-checkbox" value="ALL" checked> All Departments</label>`;
            
            majors.forEach(m => {
                const displayName = m.name ? `${m.prefix} - ${m.name}` : m.prefix;
                html += `<label class="flex items-center gap-2 cursor-pointer hover:bg-theme-surface-hover p-1 rounded transition-colors"><input type="checkbox" class="accent-theme-accent-main major-checkbox" value="${m.prefix}"> ${displayName}</label>`;
            });

            container.innerHTML = html;
            
            const majorFilterInput = this.dom.clearMajorsBtn.parentElement.parentElement.querySelector('input[type="text"]');
            if (majorFilterInput) {
                majorFilterInput.addEventListener('input', (e) => {
                    const term = e.target.value.toLowerCase();
                    container.querySelectorAll('label').forEach(label => {
                        const isAll = label.querySelector('input').value === 'ALL';
                        label.style.display = (isAll || label.textContent.toLowerCase().includes(term)) ? 'flex' : 'none';
                    });
                });
            }
        } catch (error) {
            console.error("Failed to load dynamic majors:", error);
        }
    }

    markSearchReady() {
        if (!this.dom.searchBtn) return;
        this.dom.searchBtn.disabled = false;
        this.dom.searchBtn.classList.remove('bg-theme-border', 'text-theme-text-muted', 'cursor-not-allowed');
        this.dom.searchBtn.classList.add('bg-theme-accent-main', 'text-theme-text-inverse', 'hover:bg-theme-accent-hover', 'shadow-md');
    }

    async init() {
        if (window.lucide) lucide.createIcons();
        try {
            await this.db.init();
            this.ui.setReadyStatus();
            await this.populateDynamicMajors();
            
            if (this.dom.searchInput) {
                this.dom.searchInput.disabled = false;
                this.dom.searchInput.value = ""; 
            }
        } catch (error) {
            this.ui.setErrorStatus("DB Connection Failed");
            console.error(error);
        }
    }

    async executeSearch() {
        // Abort the previous search to prevent Race Conditions
        if (this.currentSearchController) {
            this.currentSearchController.abort();
        }
        this.currentSearchController = new AbortController();
        const signal = this.currentSearchController.signal;

        if (this.dom.searchBtn) {
            this.dom.searchBtn.disabled = true;
            this.dom.searchBtn.classList.add('bg-theme-border', 'text-theme-text-muted', 'cursor-not-allowed');
            this.dom.searchBtn.classList.remove('bg-theme-accent-main', 'text-theme-text-inverse', 'hover:bg-theme-accent-hover', 'shadow-md');
        }
        
        this.ui.showLoading();
        
        try {
            const limit = this.store.filters.loadAll ? 'all' : 25;
            const dbResults = await this.db.searchCourses(this.store.filters, limit, signal);
            
            // Transform Data for UI 
            const formattedCourses = CourseService.shapeDataForUI(dbResults.rows);
            
            // Update Store Pagination State
            this.store.state.currentAllIds = dbResults.allIds;
            this.store.state.totalMatches = dbResults.totalMatches;
            this.store.state.currentOffset = limit === 'all' ? dbResults.allIds.length : 25;
            
            this.ui.renderCourses(formattedCourses, dbResults.totalMatches, false); 
            this.setupObserver();
            
            if (this.store.state.isExpanded || (formattedCourses.length > 0 && formattedCourses.length <= 3)) {
                this.ui.toggleAll(true);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Search aborted due to a new request.');
                return;
            }
            console.error("Search failed:", error);
            this.ui.renderErrorState();
        }
    }

    setupObserver() {
        if (this.store.state.observer) this.store.state.observer.disconnect();

        const sentinel = document.getElementById('scroll-sentinel');
        if (!sentinel) return;

        this.store.state.observer = new IntersectionObserver(async (entries) => {
            const entry = entries[0];
            if (entry.isIntersecting && !this.store.state.isLoadingMore && this.store.state.currentOffset < this.store.state.currentAllIds.length) {
                await this.loadMore();
            }
        }, { rootMargin: '200px' });

        this.store.state.observer.observe(sentinel);
    }

    async loadMore() {
        this.store.state.isLoadingMore = true;
        this.ui.showLoadingMore(true);

        try {
            const nextIds = this.store.state.currentAllIds.slice(this.store.state.currentOffset, this.store.state.currentOffset + 25);
            
            // Use the active abort signal to kill hydration if a new search fires
            const signal = this.currentSearchController?.signal;
            const nextRows = await this.db.hydrateCourses(nextIds, this.store.filters.sortBy, signal);
            
            const nextResults = CourseService.shapeDataForUI(nextRows);
            this.store.state.currentOffset += 25;
            
            this.ui.renderCourses(nextResults, this.store.state.totalMatches, true); 
            
            if (this.store.state.isExpanded) this.ui.toggleAll(true);
            this.setupObserver();
        } catch (error) {
            if (error.name !== 'AbortError') console.error("Hydration failed:", error);
        } finally {
            this.store.state.isLoadingMore = false;
            this.ui.showLoadingMore(false);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});