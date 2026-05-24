import { QUARTER_MAP, ATTR_COLUMNS_MAP } from './constants.js';

export const getQuarterColorClasses = (quarterStr) => {
    const upper = quarterStr.toUpperCase();
    if (upper.includes("AUT")) return "badge-aut";
    if (upper.includes("WIN")) return "badge-win";
    if (upper.includes("SPR")) return "badge-spr";
    if (upper.includes("SUM")) return "badge-sum";
    return "badge-default";
};

// Takes the active filters AND the majorToPrefix mapping dictionary 
export const buildWhereClause = (filters, majorToPrefixes = {}) => {
    let conditions = []; // Tweak 3: Removed 1=1 boilerplate

    if (filters.compiledQuery) {
        conditions.push(`(${filters.compiledQuery})`);
    }

    if (filters.majors.length > 0) {
        const validPrefixes = [];
        for (const majorCode of filters.majors) {
            if (majorToPrefixes[majorCode]) {
                validPrefixes.push(...majorToPrefixes[majorCode]);
            }
        }
        
        if (validPrefixes.length > 0) {
            const prefixStr = validPrefixes.map(p => `'${p.replace(/'/g, "''")}'`).join(', ');
            conditions.push(`course_prefix IN (${prefixStr})`);
        } else {
            conditions.push(`1=0`); 
        }
    }

    // Tweak 1: Course Level Integer Math
    if (filters.levels.length > 0) {
        const levelHundreds = [];
        let has800Plus = false;

        filters.levels.forEach(lvl => {
            if (lvl === '800') {
                has800Plus = true;
            } else {
                levelHundreds.push(parseInt(lvl) / 100);
            }
        });

        const levelConds = [];
        if (levelHundreds.length > 0) {
            levelConds.push(`CAST(course_number // 100 AS INT) IN (${levelHundreds.join(', ')})`);
        }
        if (has800Plus) {
            levelConds.push(`course_number >= 800`);
        }

        if (levelConds.length === 1) {
            conditions.push(levelConds[0]);
        } else if (levelConds.length > 1) {
            conditions.push(`(${levelConds.join(' OR ')})`);
        }
    }

    if (filters.startYear) {
        const qWeight = filters.startQuarter ? QUARTER_MAP[filters.startQuarter.toUpperCase()] : 1;
        conditions.push(`term_code >= ${parseInt(filters.startYear) * 10 + qWeight}`);
    }
    if (filters.endYear) {
        const qWeight = filters.endQuarter ? QUARTER_MAP[filters.endQuarter.toUpperCase()] : 4;
        conditions.push(`term_code <= ${parseInt(filters.endYear) * 10 + qWeight}`);
    }

    if (filters.quarters.length > 0) {
        const qList = filters.quarters.map(q => QUARTER_MAP[q.toUpperCase()]).join(', ');
        conditions.push(`(term_code % 10) IN (${qList})`);
    }

    // --- SECTION INCLUDES ---
    let sectionBaseFilters = [];

    if (filters.sectionTypes.length > 0) {
        const types = filters.sectionTypes.map(t => `'${t}'`).join(', ');
        sectionBaseFilters.push(`s.section_type IN (${types})`);
    }
    if (filters.minCredits !== "") sectionBaseFilters.push(`s.credits_min >= ${parseFloat(filters.minCredits)}`);
    if (filters.maxCredits !== "") sectionBaseFilters.push(`s.credits_max <= ${parseFloat(filters.maxCredits)}`);

    for (const attr of filters.attributes) {
        if (attr === 'Restricted') sectionBaseFilters.push(`s.restrictions.restricted_registration = true`);
        else if (attr === 'Add Code') sectionBaseFilters.push(`s.restrictions.add_code_required = true`);
        else if (attr === 'CR/NC') sectionBaseFilters.push(`s.is_credit_no_credit = true`);
        else if (ATTR_COLUMNS_MAP[attr]) sectionBaseFilters.push(`s.attributes.${ATTR_COLUMNS_MAP[attr]} = true`);
    }

    if (filters.daysInclude.length > 0) {
        const daysConds = filters.daysInclude.map(d => `list_contains(m.time.days, '${d}')`);
        sectionBaseFilters.push(`len(list_filter(s.meetings, m -> ${daysConds.join(' AND ')})) > 0`);
    }

    if (sectionBaseFilters.length > 0) {
        conditions.push(`len(list_filter(sections, s -> ${sectionBaseFilters.join(' AND ')})) > 0`);
    }


    // --- SECTION EXCLUDES ---
    let sectionExceptFilters = [];

    if (filters.tbaMode === 'exclude') {
        sectionExceptFilters.push(`len(list_filter(s.meetings, m -> m.time.is_tba = true)) > 0`);
    }

    if (filters.daysExclude.length > 0) {
        const daysConds = filters.daysExclude.map(d => `list_contains(m.time.days, '${d}')`);
        sectionExceptFilters.push(`len(list_filter(s.meetings, m -> (${daysConds.join(' OR ')}))) > 0`);
    }

    if (filters.startTime !== "") {
        sectionExceptFilters.push(`len(list_filter(s.meetings, m -> m.time.is_tba = false AND m.time.start_time IS NOT NULL AND m.time.start_time < '${filters.startTime}')) > 0`);
    }
    
    if (filters.endTime !== "") {
        sectionExceptFilters.push(`len(list_filter(s.meetings, m -> m.time.is_tba = false AND m.time.end_time IS NOT NULL AND m.time.end_time > '${filters.endTime}')) > 0`);
    }

    if (filters.attributes.includes('No Extra Fees')) {
        sectionExceptFilters.push(`s.fee IS NOT NULL AND s.fee > 0`);
    }

    if (sectionExceptFilters.length > 0) {
        // Factored out the time scope evaluation!
        const timeScopeCond = filters.timeScope === 'primary' ? `s.is_primary = true AND ` : ``;
        conditions.push(`NOT (len(list_filter(sections, s -> ${timeScopeCond}(${sectionExceptFilters.join(' OR ')}))) > 0)`);
    }

    // Tweak 3: Apply the fallback cleanly here
    return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
};