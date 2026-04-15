import logging
from parse.normalize import NormalizedCourseDict

# Set up a basic logger to track dropped data
logger = logging.getLogger(__name__)

def verify_schedule_data(courses: list[NormalizedCourseDict]) -> list[NormalizedCourseDict]:
    """
    Filters out courses and sections that are missing critical 
    primary key data required for database ingestion.
    """
    valid_courses: list[NormalizedCourseDict] = []
    
    for c in courses:
        prefix = c['course_prefix']
        num    = c['course_number']
        
        # 1. Verify Course Primary Keys
        if not prefix or not str(prefix).strip():
            logger.warning(f"Dropped Course: Missing course_prefix. Data: {c['course_title']}")
            continue
            
        if num is None:
            logger.warning(f"Dropped Course: Missing course_number. Prefix: {prefix}")
            continue
            
        # 2. Verify Section Primary Keys
        valid_sections = []
        for s in c['sections']:
            sec_id = s['section_id']
            
            if not sec_id or not str(sec_id).strip():
                logger.warning(f"Dropped Section in {prefix} {num}: Missing section_id.")
                continue
                
            valid_sections.append(s)
            
        # 3. Final Course Check: Does it actually have any valid sections left?
        if not valid_sections:
            logger.warning(f"Dropped Course {prefix} {num}: No valid sections remained.")
            continue
            
        # 4. Reassign only the valid sections and keep the course
        c['sections'] = valid_sections
        valid_courses.append(c)
        
    return valid_courses