import re

def normalize_schedule_data(courses: list[dict]) -> list[dict]:
    """
    Takes the raw output from parse_schedule and normalizes all fields
    into strongly typed variables (ints, bools, and structured dicts).
    """
    cleaned_courses = []
    
    for course in courses:
        # Clean Course Level
        c_num = clean_int(course.get('course_number'))
        
        cleaned_course = {
            'course_prefix'    : course.get('course_prefix'),
            'course_number'    : c_num if c_num is not None else course.get('course_number'),
            'course_title'     : course.get('course_title'),
            'has_prerequisites': bool(course.get('prerequisites')),
            'notes'            : course.get('notes'),
            'sections'         : []
        }
        
        # Clean Section Level
        for sec in course.get('sections', []):
            credits_min, credits_max, sec_type = clean_credits(sec.get('credits'))
            enrolled, limit, is_est = clean_enrollment(sec.get('enrollment_limit'))
            is_primary_section = (sec_type is None)
            
            cleaned_sec = {
                'section_id'         : sec.get('section_id'),
                'is_primary'         : is_primary_section,
                'SLN'                : clean_int(sec.get('SLN')),
                'section_type'       : sec_type,
                'credits_min'        : credits_min,
                'credits_max'        : credits_max,
                'status'             : sec.get('status'),
                'enrolled'           : enrolled,
                'enrollment_limit'   : limit,
                'is_limit_estimate'  : is_est,
                'is_credit_no_credit': sec.get('grades') == 'CR/NC',
                'fee'                : clean_fee(sec.get('fee')),
                'restrictions'       : clean_restrictions(sec.get('restrictions')),
                'attributes'         : clean_other(sec.get('other')),
                'meetings'           : [],
                'notes'              : sec.get('notes')
            }
            
            # Zip the parallel lists of times, buildings, and instructors together
            times = sec.get('times', [])
            buildings = sec.get('building_room', [])
            instructors = sec.get('instructor', [])
            
            for i in range(len(times)):
                t_str = times[i] if i < len(times) else None
                b_str = buildings[i] if i < len(buildings) else None
                inst_str = instructors[i] if i < len(instructors) else None
                
                cleaned_sec['meetings'].append({
                    'time': clean_time(t_str),
                    'building_room': clean_building(b_str),
                    'instructor': inst_str
                })
                
            cleaned_course['sections'].append(cleaned_sec)
            
        cleaned_courses.append(cleaned_course)
        
    return cleaned_courses

# --- Extraction Helpers ---

def clean_int(val: str) -> int | None:
    if not val: return None
    try:
        return int(re.sub(r'\D', '', str(val)))
    except ValueError:
        return None

def clean_fee(val: str) -> int | None:
    if not val: return None
    # Strips everything except digits (e.g. "$150" -> 150)
    match = re.search(r'\d+', val)
    return int(match.group(0)) if match else None

def clean_building(val: str) -> str | None:
    if not val: return None
    v = val.strip()
    if v == "* *" or v == "TBA":
        return None
    return v

def clean_enrollment(val: str) -> tuple[int | None, int | None, bool]:
    if not val: return None, None, False
    
    match = re.search(r'(\d+)\s*/\s*(\d+)(E?)', val)
    if match:
        enrolled = int(match.group(1))
        limit = int(match.group(2))
        is_est = bool(match.group(3))
        return enrolled, limit, is_est
    return None, None, False

def clean_credits(val: str) -> tuple[int | None, int | None, str | None]:
    """Returns (min_credits, max_credits, section_type)"""
    if not val: return None, None, None
    v = val.strip()
    
    if v.isalpha() and v != "VAR":
        return None, None, v # Pure alphabetical (QZ, LB, ST)
    if "-" in v:
        parts = v.split("-")
        return int(parts[0]), int(parts[1]), None # e.g. "1-5"
    if v.isdigit() or "." in v:
        try:
            c = int(float(v))
            return c, c, None # e.g. "4" -> min 4, max 4
        except ValueError:
            pass
            
    return None, None, None # Catch all for "VAR" or weird strings

def clean_restrictions(val: str) -> dict:
    res = {
        'restricted_registration': False,
        'add_code_required': False,
        'independent_study': False
    }
    if not val: return res
    
    if 'Restr' in val: res['restricted_registration'] = True
    if '>' in val: res['add_code_required'] = True
    if 'IS' in val: res['independent_study'] = True
    return res

def clean_other(val: str) -> dict:
    attrs = {
        'asynchronous': False, 'hybrid': False, 'online': False,
        'community_engaged': False, 'honors': False, 'jointly_offered': False,
        'research': False, 'service_learning': False, 'writing': False,
        'new_course': False, 'no_financial_aid': False
    }
    if not val: return attrs

    if 'A' in val: attrs['asynchronous'] = True
    if 'B' in val: attrs['hybrid'] = True
    if 'O' in val: attrs['online'] = True
    if 'E' in val: attrs['community_engaged'] = True
    if 'H' in val: attrs['honors'] = True
    if 'J' in val: attrs['jointly_offered'] = True
    if 'R' in val: attrs['research'] = True
    if 'S' in val: attrs['service_learning'] = True
    if 'W' in val: attrs['writing'] = True
    if '%' in val: attrs['new_course'] = True
    if '#' in val: attrs['no_financial_aid'] = True
    return attrs

def clean_time(val: str) -> dict:
    res = {
        'is_tba': False,
        'days': [],
        'start_time': None,
        'end_time': None
    }
    if not val: 
        return res
        
    v = val.strip()
    if 'TBA' in v.upper() or 'ARRANGED' in v.upper():
        res['is_tba'] = True
        return res
        
    # Example input: "MWF    1130-1220" or "Th    130-320"
    match = re.search(r'([A-Za-z]+)\s+(\d{1,4})[-:](\d{1,4})', v)
    if not match:
        return res
        
    days_str = match.group(1)
    start_str = match.group(2)
    end_str = match.group(3)
    
    # Parse days using regex to handle 'Th' and 'Su' correctly without overlapping 'T' or 'S'
    res['days'] = re.findall(r'Th|Su|M|T|W|F|S', days_str)
    
    res['start_time'] = format_military_time(start_str)
    res['end_time'] = format_military_time(end_str)
    
    return res

def format_military_time(time_str: str) -> str | None:
    """Converts a sloppy UW time like '130' or '1130' into 24-hour '13:30' format."""
    if len(time_str) < 3: return None
    
    hour = int(time_str[:-2])
    minute = time_str[-2:]
    
    # The UW Magic Rule: If the hour is 1 through 6, it is mathematically guaranteed to be PM.
    # We add 12 to convert it to 24-hour time.
    if 1 <= hour <= 6:
        hour += 12
        
    # Format with leading zero for neatness
    return f"{hour:02d}:{minute}"