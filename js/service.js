import { formatTime } from './utils.js';

export class CourseService {
    /**
     * Transforms flat SQL rows into the nested Map structure required by the UI.
     */
    static shapeDataForUI(rows) {
        const coursesMap = new Map();

        for (const row of rows) {
            this._processCourseRow(coursesMap, row);
            if (row.section_id) this._processSectionRow(coursesMap, row);
            if (row.meeting_id) this._processMeetingRow(coursesMap, row);
        }

        // Convert Maps back to cleanly nested arrays for UI iteration
        return Array.from(coursesMap.values()).map(c => ({
            ...c,
            sections: Array.from(c.sectionsMap.values()).map(s => ({
                ...s,
                meetings: Array.from(s.meetingsMap.values())
            }))
        }));
    }

    static _processCourseRow(coursesMap, row) {
        if (!coursesMap.has(row.course_id)) {
            coursesMap.set(row.course_id, {
                prefix     : row.course_prefix,
                number     : row.course_number,
                title      : row.course_title || "Unknown Title",
                quarter    : `${row.quarter} ${row.year}`,
                notes      : row.course_notes,
                sectionsMap: new Map()
            });
        }
    }

    static _processSectionRow(coursesMap, row) {
        const course = coursesMap.get(row.course_id);
        if (!course.sectionsMap.has(row.section_id)) {
            const credStr = row.credits_min !== null 
                ? (row.credits_min === row.credits_max ? `${row.credits_min}` : `${row.credits_min}-${row.credits_max}`) 
                : "";

            const otherArgs = [];
            const flagMap = {
                writing   : 'W', honors           : 'H', jointly_offered : 'J', online  : 'O', asynchronous: 'A',
                hybrid    : 'B', community_engaged: 'E', service_learning: 'S', research: 'R',
                new_course: '%', no_financial_aid : '#'
            };
            
            for (const [key, flag] of Object.entries(flagMap)) {
                if (row[key] === 1) otherArgs.push(flag);
            }

            course.sectionsMap.set(row.section_id, {
                sln        : row.sln ? row.sln.toString()                        : 'N/A',
                id         : row.section_id.split('-').pop(),
                isPrimary  : row.is_primary === 1,
                type       : row.section_type || 'N/A',
                cred       : credStr,
                enrl       : row.enrolled !== null ? row.enrolled                : '-',
                limit      : row.enrollment_limit !== null ? row.enrollment_limit: '-',
                notes      : row.section_notes,
                restr      : row.restricted_registration === 1,
                addCode    : row.add_code_required === 1,
                crnc       : row.is_credit_no_credit === 1,
                fee        : row.fee,
                other      : otherArgs,
                meetingsMap: new Map()
            });
        }
    }

    static _processMeetingRow(coursesMap, row) {
        const section = coursesMap.get(row.course_id).sectionsMap.get(row.section_id);
        if (!section.meetingsMap.has(row.meeting_id)) {
            const start = formatTime(row.start_time);
            const end   = formatTime(row.end_time);
            
            section.meetingsMap.set(row.meeting_id, {
                days      : row.days || 'TBA',
                time      : (start && end) ? `${start}-${end}`: (start || '-'),
                bldg      : row.building_room || 'TBA',
                instructor: row.instructor || '-'
            });
        }
    }
}