import re
from typing import TypedDict, Any
from parse.schedule import CourseDict as RawCourseDict

class TimeDict(TypedDict):
    is_tba    : bool
    days      : list[str]
    start_time: str | None
    end_time  : str | None

class RestrictionsDict(TypedDict):
    restricted_registration: bool
    add_code_required      : bool
    independent_study      : bool

class AttributesDict(TypedDict):
    asynchronous     : bool
    hybrid           : bool
    online           : bool
    community_engaged: bool
    honors           : bool
    jointly_offered  : bool
    research         : bool
    service_learning : bool
    writing          : bool
    new_course       : bool
    no_financial_aid : bool

class NormalizedMeetingDict(TypedDict):
    time         : TimeDict
    building_room: str | None
    instructor   : str | None

class NormalizedSectionDict(TypedDict):
    section_id         : str | None
    is_primary         : bool
    SLN                : int | None
    section_type       : str | None
    credits_min        : int | None
    credits_max        : int | None
    status             : str | None
    enrolled           : int | None
    enrollment_limit   : int | None
    is_limit_estimate  : bool
    is_credit_no_credit: bool
    fee                : int | None
    restrictions       : RestrictionsDict
    attributes         : AttributesDict
    meetings           : list[NormalizedMeetingDict]
    notes              : str | None

class NormalizedCourseDict(TypedDict):
    course_prefix    : str | None
    course_number    : int | None
    course_title     : str | None
    gen_ed_reqs      : list[str]
    has_prerequisites: bool
    notes            : str | None
    sections         : list[NormalizedSectionDict]

def normalize_schedule_data(courses: list[RawCourseDict]) -> list[NormalizedCourseDict]:
    """
    Takes the raw output from parse_schedule and normalizes all fields
    into strongly typed variables (ints, bools, and structured dicts).
    """
    cleaned_courses: list[NormalizedCourseDict] = []
    
    for course in courses:
        cleaned_course = {
            'course_prefix'    : course['course_prefix'] or None,
            'course_number'    : clean_int(course['course_number']),
            'course_title'     : course['course_title'] or None,
            'gen_ed_reqs'      : clean_gen_eds(course['gen_ed_reqs']),
            'has_prerequisites': bool(course['prerequisites']),
            'notes'            : course['notes'],
            'sections'         : []
        }
        
        # Clean Section Level
        for sec in course['sections']:
            credits_min, credits_max, sec_type = clean_credits(sec['credits'])
            enrolled, limit, is_est = clean_enrollment(sec['enrollment_limit'])
            is_primary_section = (sec_type is None)

            restr = clean_restrictions(sec['restrictions'])
            final_sec_type = sec_type
            if sec_type == 'IS' or restr['independent_study']:
                restr['independent_study'] = True
                final_sec_type = 'IS'
            elif is_primary_section and sec_type is None:
                final_sec_type = 'LC'
            
            cleaned_sec = {
                'section_id'         : sec['section_id'] or None,
                'is_primary'         : is_primary_section,
                'SLN'                : clean_int(sec['SLN']),
                'section_type'       : final_sec_type,
                'credits_min'        : credits_min,
                'credits_max'        : credits_max,
                'status'             : sec['status'] or None,
                'enrolled'           : enrolled,
                'enrollment_limit'   : limit,
                'is_limit_estimate'  : is_est,
                'is_credit_no_credit': sec['grades'] == 'CR/NC',
                'fee'                : clean_fee(sec['fee']),
                'restrictions'       : restr,
                'attributes'         : clean_other(sec['other']),
                'meetings'           : [],
                'notes'              : sec['notes']
            }
            
            # Zip the parallel lists of times, buildings, and instructors together
            for t_str, b_str, i_str in zip(sec['times'], sec['building_room'], sec['instructor']):
                cleaned_sec['meetings'].append({
                    'time'         : clean_time(t_str),
                    'building_room': clean_building(b_str),
                    'instructor'   : i_str or None
                })
                
            cleaned_course['sections'].append(cleaned_sec)
            
        cleaned_courses.append(cleaned_course)
        
    return cleaned_courses

# --- Extraction Helpers ---

def clean_gen_eds(val: str):
    if not val: return []
    cleaned = val.replace('(', '').replace(')', '')
    parts = re.split(r'[/,]', cleaned)
    return [part.strip() for part in parts if part.strip()]

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
        'add_code_required'      : False,
        'independent_study'      : False
    }
    if not val: return res
    
    if 'Restr' in val: res['restricted_registration'] = True
    if '>' in val: res['add_code_required']           = True
    if 'IS' in val: res['independent_study']          = True
    return res

def clean_other(val: str) -> dict:
    attrs = {
        'asynchronous'     : False, 'hybrid'          : False, 'online'         : False,
        'community_engaged': False, 'honors'          : False, 'jointly_offered': False,
        'research'         : False, 'service_learning': False, 'writing'        : False,
        'new_course'       : False, 'no_financial_aid': False
    }
    if not val: return attrs

    if 'A' in val: attrs['asynchronous']      = True
    if 'B' in val: attrs['hybrid']            = True
    if 'O' in val: attrs['online']            = True
    if 'E' in val: attrs['community_engaged'] = True
    if 'H' in val: attrs['honors']            = True
    if 'J' in val: attrs['jointly_offered']   = True
    if 'R' in val: attrs['research']          = True
    if 'S' in val: attrs['service_learning']  = True
    if 'W' in val: attrs['writing']           = True
    if '%' in val: attrs['new_course']        = True
    if '#' in val: attrs['no_financial_aid']  = True
    return attrs

def clean_time(val: str) -> dict:
    res = {
        'is_tba'    : False,
        'days'      : [],
        'start_time': None,
        'end_time'  : None
    }
    if not val: 
        return res
        
    v = val.strip()
    if 'TBA' in v.upper() or 'ARRANGED' in v.upper():
        res['is_tba'] = True
        return res
        
    # Added ([Pp]?) to the end to capture the PM flag
    match = re.search(r'([A-Za-z]+)\s+(\d{1,4})[-:](\d{1,4})([Pp]?)', v)
    if not match:
        return res
        
    days_str  = match.group(1)
    start_str = match.group(2)
    end_str   = match.group(3)
    has_p     = bool(match.group(4))
    
    res['days'] = re.findall(r'Th|Su|M|T|W|F|S', days_str)
    
    # Pass them together so we can do chronological checks
    res['start_time'], res['end_time'] = resolve_time_block(start_str, end_str, has_p)
    
    return res

def resolve_time_block(start_str: str, end_str: str, has_p: bool) -> tuple[str | None, str | None]:
    if len(start_str) < 3 or len(end_str) < 3: 
        return None, None
        
    start_val = int(start_str)
    start_h = int(start_str[:-2])
    start_m = int(start_str[-2:])
    
    end_h = int(end_str[:-2])
    end_m = int(end_str[-2:])
    
    # 1. Anchor the Start Time using the 4:30 Boundary Zone Logic
    if has_p:
        # Evening Zone: Guaranteed to be >= 4:30 PM
        start_is_pm = True
    else:
        # No 'P': The class starts before 4:30 PM.
        # If the integer value falls in the Dead Zone (1:00 to 4:29 AM) 
        # or the 12:xx hour (12:00 to 12:59 AM), it MUST be the afternoon PM variant.
        if (100 <= start_val <= 429) or (1200 <= start_val <= 1259):
            start_is_pm = True
        else:
            # Morning Zone: 430 to 1159 (4:30 AM to 11:59 AM)
            start_is_pm = False
            
    # Standardize 12 to 0 for easier 24h math
    if start_h == 12: 
        start_h = 0
    if start_is_pm:
        start_h += 12
        
    # 2. Determine the End Time chronologically
    end_h_am = 0 if end_h == 12 else end_h
    end_h_pm = end_h_am + 12
    
    start_total_mins = start_h * 60 + start_m
    end_am_mins = end_h_am * 60 + end_m
    end_pm_mins = end_h_pm * 60 + end_m
    
    # This duration checker inherently allows ending in the Dead Zone
    def get_duration(end_mins):
        if end_mins <= start_total_mins:
            # Handles wrapping past midnight into the dead zone
            return (end_mins + 1440) - start_total_mins
        return end_mins - start_total_mins
        
    dur_am = get_duration(end_am_mins)
    dur_pm = get_duration(end_pm_mins)
    
    final_end_h = end_h_am if dur_am < dur_pm else end_h_pm
        
    return f"{start_h:02d}:{start_m:02d}", f"{final_end_h:02d}:{end_m:02d}"