import { PARQUET_ATTR_TO_CODE, REVERSE_QUARTER_MAP } from './constants.js';

export class CourseService {
    /**
     * Unseals Apache Arrow Proxies and derives stripped term_code variables
     */
    static shapeDataForUI(rows) {
        return rows.map(row => {
            const course = { ...row }; 

            // Decode the combined term_code directly
            const termCode = Number(course.term_code);
            course.ui_year = Math.floor(termCode / 10);
            course.ui_quarter = REVERSE_QUARTER_MAP[termCode % 10] || 'UNK';

            course.gen_ed_reqs = course.gen_ed_reqs ? [...course.gen_ed_reqs] : [];
            const rawSections = course.sections ? [...course.sections] : [];

            course.sections = rawSections.map(sec => {
                const s = { ...sec }; 
                s.restrictions = s.restrictions ? { ...s.restrictions } : {};
                s.attributes = s.attributes ? { ...s.attributes } : {};
                
                const badges = [];
                for (const [attrKey, code] of Object.entries(PARQUET_ATTR_TO_CODE)) {
                    if (s.attributes[attrKey]) badges.push(code);
                }
                s.ui_badges = badges;

                s.ui_short_id = s.section_id.split('-').pop();
                s.ui_credits = s.credits_min !== null 
                    ? (s.credits_min === s.credits_max ? `${s.credits_min}` : `${s.credits_min}-${s.credits_max}`) 
                    : "";

                const rawMeetings = s.meetings ? [...s.meetings] : [];
                s.meetings = rawMeetings.map(mtg => {
                    const m = { ...mtg };
                    m.time = m.time ? { ...m.time } : {};
                    m.time.days = m.time.days ? [...m.time.days] : [];
                    
                    const start = m.time.start_time || '';
                    const end = m.time.end_time || '';
                    
                    m.ui_days = m.time.days.join('');
                    m.ui_time = (start && end) ? `${start}-${end}` : (start || '');
                    
                    return m;
                });

                return s;
            });

            return course;
        });
    }
}