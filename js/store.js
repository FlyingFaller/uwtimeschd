export class AppStore {
    constructor() {
        this.reset();
    }

    reset() {
        this.filters = {
            query       : '',
            majors      : [],
            attributes  : [],
            daysInclude : [],
            daysExclude : [],
            quarters    : [],
            tbaMode     : 'include',
            levels      : [],
            sectionTypes: [],
            minCredits  : '',
            maxCredits  : '',
            startYear   : '',
            startQuarter: '',
            endYear     : '',
            endQuarter  : '',
            timeScope   : 'primary',
            startTime   : '',
            endTime     : '',
            sortBy      : 'newest',
            loadAll     : false
        };

        this.state = {
            isExpanded   : false,
            currentAllIds: [],
            currentOffset: 0,
            isLoadingMore: false,
            totalMatches : 0
        };
    }

    setFilter(key, value) {
        this.filters[key] = value;
    }

    toggleArrayFilter(key, value) {
        const arr = this.filters[key];
        const idx = arr.indexOf(value);
        if (idx > -1) {
            arr.splice(idx, 1);
        } else {
            arr.push(value);
        }
    }
}