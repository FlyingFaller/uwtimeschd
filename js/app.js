import { DatabaseManager } from './database.js';
import { UIManager } from './ui.js';
import { AppStore } from './store.js';
import { CourseService } from './service.js';

class App {
    constructor() {
        this.db = new DatabaseManager("data/schedules_dataset/");
        this.ui = new UIManager();
        this.store = new AppStore();
        
        // Built by the deduplication algorithm during init
        this.prefixToMajor = {}; 
        this.majorToPrefixes = {}; 

        this.currentSearchController = null;
        
        this.dom = {
            searchBtn : document.getElementById('search-btn'),
            modeDesc  : document.getElementById('day-mode-desc'),
            filterInputs: ['min-credits', 'max-credits', 'start-time', 'end-time', 'start-year', 'start-quarter', 'end-year', 'end-quarter']
        };

        this.initDelegatedEvents();
    }

    initDelegatedEvents() {
        const clickIdActions = {
            'search-btn': () => { if (!this.dom.searchBtn.disabled) this.executeSearch(); },
            'reset-filters-btn': () => this.resetFilters(),
            'theme-toggle': () => {
                document.documentElement.classList.toggle('dark');
                document.documentElement.classList.toggle('light');
            },
            'expand-all-btn': () => { this.store.state.isExpanded = true; this.ui.toggleAll(true); },
            'collapse-all-btn': () => { this.store.state.isExpanded = false; this.ui.toggleAll(false); },
            'clear-majors': () => this.clearMajors()
        };

        const clickSelectorActions = {
            '.quarter-btn': (btn) => {
                this._toggleQuarterButton(btn);
                this.store.toggleArrayFilter('quarters', btn.dataset.quarter);
                this.markSearchReady();
            },
            '.mode-btn': (btn) => {
                this._handleRadioToggleGroup('.mode-btn', btn);
                const mode = btn.dataset.mode;
                
                if (this.dom.modeDesc) this.dom.modeDesc.textContent = mode === 'include' ? "Must meet on ALL selected days" : "Cannot meet on ANY selected day";
                
                if (mode === 'include') {
                    this.store.setFilter('daysInclude', [...this.store.filters.daysExclude]);
                    this.store.setFilter('daysExclude', []);
                } else {
                    this.store.setFilter('daysExclude', [...this.store.filters.daysInclude]);
                    this.store.setFilter('daysInclude', []);
                }
                this.markSearchReady();
            },
            '.tba-btn': (btn) => {
                this._handleRadioToggleGroup('.tba-btn', btn);
                this.store.setFilter('tbaMode', btn.dataset.tba);
                this.markSearchReady();
            },
            '.filter-btn:not(.quarter-btn), .filter-chip': (btn) => {
                this._toggleFilterButton(btn);
                
                if (btn.classList.contains('day-btn')) {
                    const currentMode = document.querySelector('.mode-btn.active')?.dataset.mode || 'include';
                    this.store.toggleArrayFilter(currentMode === 'include' ? 'daysInclude' : 'daysExclude', btn.dataset.day);
                }
                else if (btn.classList.contains('level-btn')) this.store.toggleArrayFilter('levels', btn.dataset.level);
                else this.store.toggleArrayFilter('attributes', btn.dataset.attr);
                
                this.markSearchReady();
            }
        };

        const changeIdActions = {
            'sort-select': (t) => { this.store.setFilter('sortBy', t.value); this.markSearchReady(); },
            'load-all-toggle': (t) => { this.store.setFilter('loadAll', t.checked); this.executeSearch(); },
            'time-scope': (t) => { this.store.setFilter('timeScope', t.value); this.markSearchReady(); },
            'start-quarter': (t) => this._handleQuarterChange(t),
            'end-quarter': (t) => this._handleQuarterChange(t)
        };

        document.addEventListener('click', (e) => {
            const target = e.target;
            const closestId = target.closest('[id]')?.id;

            if (closestId && clickIdActions[closestId]) return clickIdActions[closestId]();

            for (const [selector, handler] of Object.entries(clickSelectorActions)) {
                const el = target.closest(selector);
                if (el) return handler(el);
            }
        });

        document.addEventListener('input', (e) => {
            const t = e.target;
            if (t.id === 'omni-search') {
                this.store.setFilter('query', t.value);
                this.markSearchReady();
            } else if (t.id === 'major-search-filter') {
                const term = t.value.toLowerCase();
                const spacelessTerm = term.replace(/\s+/g, ''); 
                
                document.querySelectorAll('.major-label-wrapper').forEach(label => {
                    const isAll = label.querySelector('input').value === 'ALL';
                    const searchData = label.dataset.search || '';
                    
                    const isMatch = searchData.includes(term) || (spacelessTerm && searchData.includes(spacelessTerm));
                    label.style.display = (isAll || isMatch) ? 'flex' : 'none';
                });
            } else if (this.dom.filterInputs.includes(t.id)) {
                const key = t.id.replace(/-([a-z])/g, g => g[1].toUpperCase());
                this.store.setFilter(key, t.value);
                this.markSearchReady();
            }
        });

        document.addEventListener('change', (e) => {
            const t = e.target;
            if (changeIdActions[t.id]) return changeIdActions[t.id](t);
            
            if (t.classList.contains('type-checkbox')) {
                this.store.toggleArrayFilter('sectionTypes', t.dataset.type);
                this.markSearchReady();
            } else if (t.classList.contains('major-checkbox')) {
                this._handleMajorCheckboxChange(t);
                this.markSearchReady();
            }
        });

        document.addEventListener('keypress', (e) => {
            if (e.target.id === 'omni-search' && e.key === 'Enter' && !this.dom.searchBtn?.disabled) {
                this.executeSearch();
            }
        });
    }

    _handleQuarterChange(selectEl) {
        this.updateQuarterColor(selectEl);
        const key = selectEl.id.replace(/-([a-z])/g, g => g[1].toUpperCase());
        this.store.setFilter(key, selectEl.value);
        this.markSearchReady();
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
             if (this.store.filters.majors.length === 0 && allBox) allBox.checked = true;
        }
    }

    clearMajors() {
        document.querySelectorAll('.major-checkbox').forEach(box => box.checked = box.value === 'ALL');
        this.store.setFilter('majors', []);
        this.markSearchReady();
    }

    resetFilters() {
        const resetIds = ['omni-search', ...this.dom.filterInputs];
        resetIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const sortSel = document.getElementById('sort-select');
        if (sortSel) sortSel.value = 'newest';
        
        const loadAll = document.getElementById('load-all-toggle');
        if (loadAll) loadAll.checked = false;
        
        const scope = document.getElementById('time-scope');
        if (scope) scope.value = 'primary';

        ['start-quarter', 'end-quarter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) this.updateQuarterColor(el);
        });

        document.querySelectorAll('.type-checkbox').forEach(cb => cb.checked = false);
        document.querySelectorAll('.major-checkbox').forEach(cb => { cb.checked = cb.value === 'ALL'; });

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
        if (val && val !== '') selectEl.classList.add(`badge-${val.toLowerCase()}`);
        else selectEl.classList.add(...defaultClasses);
    }

    markSearchReady() {
        if (!this.dom.searchBtn) return;
        this.dom.searchBtn.disabled = false;
        this.dom.searchBtn.classList.remove('bg-theme-border', 'text-theme-text-muted', 'cursor-not-allowed');
        this.dom.searchBtn.classList.add('bg-theme-accent-main', 'text-theme-text-inverse', 'hover:bg-theme-accent-hover', 'shadow-md');
    }

    // --- Deduplication Algorithm ---
    async populateDynamicRegistry() {
        try {
            const response = await fetch('data/registry.json');
            if (!response.ok) throw new Error("Failed to load registry.json metadata.");
            const registry = await response.json();
            
            this.prefixToMajor = {}; 
            this.majorToPrefixes = {}; 
            
            // Pass 1: Find the "winning" major for each prefix across the entire registry
            const prefixCounts = {};
            for (const [majorCode, data] of Object.entries(registry)) {
                this.majorToPrefixes[majorCode] = []; 
                if (!data.prefixes) continue;
                
                for (const [prefix, count] of Object.entries(data.prefixes)) {
                    if (!prefixCounts[prefix] || count > prefixCounts[prefix]) {
                        prefixCounts[prefix] = count;
                        this.prefixToMajor[prefix] = majorCode;
                    }
                }
            }
            
            // Pass 2: Map the winning prefixes back to their respective majors
            for (const [prefix, majorCode] of Object.entries(this.prefixToMajor)) {
                this.majorToPrefixes[majorCode].push(prefix);
            }
            
            const clearBtn = document.getElementById('clear-majors');
            const container = clearBtn?.parentElement?.parentElement?.querySelector('.max-h-36');
            if (!container) return;
            
            let html = `<label class="major-label-wrapper flex items-center gap-2 cursor-pointer hover:bg-theme-surface-hover p-1 rounded transition-colors" data-search="all departments"><input type="checkbox" class="accent-theme-accent-main major-checkbox" value="ALL" checked> All Departments</label>`;
            
            // Generate sorted UI dropdown elements
            const sortedMajors = Object.keys(registry).sort((a, b) => {
                const nameA = registry[a].major_name || a;
                const nameB = registry[b].major_name || b;
                return nameA.localeCompare(nameB);
            });

            sortedMajors.forEach(majorCode => {
                const data = registry[majorCode];
                const winningPrefixes = this.majorToPrefixes[majorCode];
                
                // If a major "lost" all its prefixes due to duplication/counts, skip displaying it
                if (!winningPrefixes || winningPrefixes.length === 0) return;
                
                const displayName = data.major_name || majorCode;
                
                const prefixStr = winningPrefixes.join(' ').toLowerCase();
                const spacelessPrefixStr = winningPrefixes.map(p => p.replace(/\s+/g, '')).join(' ').toLowerCase();
                const searchData = `${displayName.toLowerCase()} ${prefixStr} ${spacelessPrefixStr}`;
                
                html += `<label class="major-label-wrapper flex items-center gap-2 cursor-pointer hover:bg-theme-surface-hover p-1 rounded transition-colors" data-search="${searchData}"><input type="checkbox" class="accent-theme-accent-main major-checkbox" value="${majorCode}"> <span class="truncate" title="${displayName}">${displayName}</span></label>`;
            });

            container.innerHTML = html;
            
            const textInput = clearBtn?.parentElement?.parentElement?.querySelector('input[type="text"]');
            if (textInput) textInput.id = 'major-search-filter';

        } catch (error) {
            console.error("Failed to load dynamic registry:", error);
        }
    }

    async init() {
        if (window.lucide) lucide.createIcons();
        try {
            await this.db.init();
            this.ui.setReadyStatus();
            await this.populateDynamicRegistry();
            
            const searchInput = document.getElementById('omni-search');
            if (searchInput) {
                searchInput.disabled = false;
                searchInput.value = ""; 
            }
        } catch (error) {
            this.ui.setErrorStatus("DB Connection Failed");
            console.error(error);
        }
    }

    async executeSearch() {
        if (this.currentSearchController) this.currentSearchController.abort();
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
            
            // Passing our majorToPrefixes lookup directly to the database query generator
            const totalCount = await this.db.getTotalCount(this.store.filters, this.majorToPrefixes, signal);
            this.store.state.totalMatches = totalCount;
            this.store.state.currentOffset = limit === 'all' ? totalCount : 25;

            const rawParquetRows = await this.db.getPage(this.store.filters, limit, 0, this.store.filters.sortBy, this.majorToPrefixes, signal);
            const formattedCourses = CourseService.shapeDataForUI(rawParquetRows);
            
            // Pass the 1:1 prefix -> major code mapping for accurate link generation
            this.ui.renderCourses(formattedCourses, totalCount, false, this.prefixToMajor); 
            this.setupObserver();
            
            if (this.store.state.isExpanded || (formattedCourses.length > 0 && formattedCourses.length <= 3)) {
                this.ui.toggleAll(true);
            }
        } catch (error) {
            if (error.name === 'AbortError') return;
            
            console.error("[Search Error] Query execution failed:", error);
            const queryContext = JSON.stringify(this.store.filters, null, 2);
            this.ui.renderErrorState(error, queryContext);
        }
    }

    setupObserver() {
        if (this.store.state.observer) this.store.state.observer.disconnect();

        const sentinel = document.getElementById('scroll-sentinel');
        if (!sentinel) return;

        this.store.state.observer = new IntersectionObserver(async (entries) => {
            const entry = entries[0];
            if (entry.isIntersecting && !this.store.state.isLoadingMore && this.store.state.currentOffset < this.store.state.totalMatches) {
                await this.loadMore();
            }
        }, { rootMargin: '200px' });

        this.store.state.observer.observe(sentinel);
    }

    async loadMore() {
        this.store.state.isLoadingMore = true;
        this.ui.showLoadingMore(true);

        try {
            const signal = this.currentSearchController?.signal;
            const rawParquetRows = await this.db.getPage(this.store.filters, 25, this.store.state.currentOffset, this.store.filters.sortBy, this.majorToPrefixes, signal);
            
            const nextResults = CourseService.shapeDataForUI(rawParquetRows);
            this.store.state.currentOffset += 25;
            
            this.ui.renderCourses(nextResults, this.store.state.totalMatches, true, this.prefixToMajor); 
            
            if (this.store.state.isExpanded) this.ui.toggleAll(true);
            this.setupObserver();
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("[Hydration Error] Failed to load more courses:", error);
                const queryContext = JSON.stringify(this.store.filters, null, 2);
                this.ui.renderErrorState(error, queryContext);
            }
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