import { DatabaseManager } from './database.js';
import { UIManager } from './ui.js';

class App {
    constructor() {
        this.db = new DatabaseManager("data/schedules.db");
        this.ui = new UIManager();
        
        this.searchInput = document.getElementById('omni-search');
        this.searchBtn = document.getElementById('search-btn');
        this.sortSelect = document.getElementById('sort-select');
        
        this.currentQuery = '';
        this.isExpanded = false; // Restore memory tracking
        this.bindEvents();
    }

    bindEvents() {
        // Core Search Interactions
        this.searchInput.addEventListener('input', () => this.markSearchReady());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.searchBtn.disabled) this.executeSearch();
        });
        this.searchBtn.addEventListener('click', () => this.executeSearch());

        // Accordion Controls
        document.getElementById('expand-all-btn').addEventListener('click', () => {
            this.isExpanded = true;
            this.ui.toggleAll(true);
        });
        document.getElementById('collapse-all-btn').addEventListener('click', () => {
            this.isExpanded = false;
            this.ui.toggleAll(false);
        });

        // Sorting & Scope Selects
        this.sortSelect.addEventListener('change', () => this.markSearchReady());
        document.getElementById('time-scope').addEventListener('change', () => this.markSearchReady());

        // Number and Text Inputs
        const inputIds = ['min-credits', 'max-credits', 'start-time', 'end-time'];
        inputIds.forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.markSearchReady());
        });

        // Section Type Checkboxes
        document.querySelectorAll('.type-checkbox').forEach(cb => {
            cb.addEventListener('change', () => this.markSearchReady());
        });

        // Clear Majors Button
        document.getElementById('clear-majors').addEventListener('click', () => {
            const majorCheckboxes = document.querySelectorAll('.major-checkbox');
            majorCheckboxes.forEach(box => {
                box.checked = box.value === 'ALL';
            });
            this.markSearchReady();
        });

        // Day Mode Toggle (Include/Exclude) + UX hint update
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

        // TBA Toggle
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

        // Filter Button Toggles (Chips, Days, and Course Levels)
        document.querySelectorAll('.filter-btn, .filter-chip').forEach(btn => {
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

    // Handles dynamically binding the events to the newly generated Major checkboxes
    bindMajorEvents() {
        const majorCheckboxes = document.querySelectorAll('.major-checkbox');
        majorCheckboxes.forEach(cb => {
            cb.addEventListener('change', (e) => {
                const target = e.target;
                if (target.value === 'ALL' && target.checked) {
                    majorCheckboxes.forEach(box => { if (box.value !== 'ALL') box.checked = false; });
                } else if (target.value !== 'ALL' && target.checked) {
                    document.querySelector('.major-checkbox[value="ALL"]').checked = false;
                }
                this.markSearchReady();
            });
        });
    }

    // Fetches unique prefixes from the SQLite database and populates the UI
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

    // Scrape every filter on the page
    harvestFilters() {
        const attributes = Array.from(document.querySelectorAll('.filter-chip.active')).map(btn => btn.dataset.attr);
        const activeDays = Array.from(document.querySelectorAll('.day-btn.active')).map(btn => btn.dataset.day);
        const activeLevels = Array.from(document.querySelectorAll('.level-btn.active')).map(btn => btn.dataset.level);
        const activeSectionTypes = Array.from(document.querySelectorAll('.type-checkbox:checked')).map(cb => cb.dataset.type);
        const activeMajors = Array.from(document.querySelectorAll('.major-checkbox:checked'))
                                  .map(cb => cb.value)
                                  .filter(val => val !== 'ALL');
        
        const dayModeBtn = document.querySelector('.mode-btn.active');
        const dayMode = dayModeBtn ? dayModeBtn.dataset.mode : 'include';

        const tbaBtn = document.querySelector('.tba-btn.active');
        const tbaMode = tbaBtn ? tbaBtn.dataset.tba : 'include';

        return {
            majors: activeMajors,
            attributes: attributes,
            daysInclude: dayMode === 'include' ? activeDays : [],
            daysExclude: dayMode === 'exclude' ? activeDays : [],
            tbaMode: tbaMode,
            levels: activeLevels,
            sectionTypes: activeSectionTypes,
            minCredits: document.getElementById('min-credits').value,
            maxCredits: document.getElementById('max-credits').value,
            timeScope: document.getElementById('time-scope').value,
            startTime: document.getElementById('start-time').value,
            endTime: document.getElementById('end-time').value,
            sortBy: this.sortSelect.value
        };
    }

    markSearchReady() {
        this.searchBtn.disabled = false;
        this.searchBtn.classList.remove('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
        this.searchBtn.classList.add('bg-purple-600', 'text-white', 'hover:bg-purple-700', 'shadow-md');
    }

    async init() {
        lucide.createIcons();
        try {
            await this.db.init();
            this.ui.setReadyStatus();
            
            await this.populateDynamicMajors();
            
            this.searchInput.disabled = false;
            this.searchInput.value = ""; 

        } catch (error) {
            this.ui.setErrorStatus("DB Connection Failed");
            console.error(error);
        }
    }

    async executeSearch() {
        this.currentQuery = this.searchInput.value.trim();
        
        this.searchBtn.disabled = true;
        this.searchBtn.classList.add('bg-slate-300', 'text-slate-500', 'cursor-not-allowed');
        this.searchBtn.classList.remove('bg-purple-600', 'text-white', 'hover:bg-purple-700', 'shadow-md');
        
        this.ui.showLoading();
        
        try {
            const activeFilters = this.harvestFilters();
            const results = await this.db.searchCourses(this.currentQuery, activeFilters);
            
            this.ui.renderCourses(results);
            
            // Respect the explicit expand/collapse state, or auto-expand if the result is tiny
            if (this.isExpanded) {
                this.ui.toggleAll(true);
            } else if (results.length > 0 && results.length <= 3) {
                this.ui.toggleAll(true);
            }
        } catch (error) {
            console.error("Search failed:", error);
            this.ui.container.innerHTML = `<div class="text-red-500 p-8 text-center font-bold">Query Error Occurred.</div>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});