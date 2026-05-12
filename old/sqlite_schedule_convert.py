import pyarrow as pa
import pyarrow.parquet as pq
import sqlite3
import os
import re
import json
from collections import defaultdict
from management.utils import stitch_database
from management.database_manager import calculate_term_code

# ==========================================
# FILE PATHS
# ==========================================
DATA_DIR     = "data"
SQLITE_PATH  = os.path.join(DATA_DIR, "schedules.db")
DUCKDB_PATH = os.path.join(DATA_DIR, "schedules.parquet")
MAJORS_JSON  = os.path.join(DATA_DIR, "majors.json")

# ==========================================
# TRANSFORMATION HELPERS
# ==========================================

def int_to_time_str(val: int | None) -> str | None:
    """Reverses integer HHMM (e.g., 1330) back to string format '13:30'."""
    if val is None:
        return None
    return f"{val // 100:02d}:{val % 100:02d}"

def parse_days_str(days_str: str | None) -> list[str]:
    """Reverses 'MWF' string back to list ['M', 'W', 'F']."""
    if not days_str:
        return []
    return re.findall(r'Th|Su|M|T|W|F|S', days_str)

# ==========================================
# RECONSTRUCTION LOGIC
# ==========================================

def extract_majors(cursor: sqlite3.Cursor):
    """Extracts the majors table to a standalone JSON file."""
    print("Extracting majors to JSON...")
    cursor.execute("SELECT course_prefix, major_name, major_code FROM majors")
    
    majors_data = [dict(row) for row in cursor.fetchall()]
    
    with open(MAJORS_JSON, 'w', encoding='utf-8') as f:
        json.dump(majors_data, f, indent=4)
        
    print(f"  -> Saved {len(majors_data)} majors to {MAJORS_JSON}")

def reconstruct_schedule(cursor: sqlite3.Cursor) -> list[dict]:
    """Reconstructs the hierarchical nested dictionary from the flat UI tables."""
    print("Reconstructing nested course structure from SQLite...")
    
    # 1. Fetch Meetings
    cursor.execute("SELECT * FROM meetings")
    meetings_by_section = defaultdict(list)
    for row in cursor.fetchall():
        meeting_dict = {
            'time': {
                'is_tba'    : bool(row['is_tba']),
                'days'      : parse_days_str(row['days']),
                'start_time': int_to_time_str(row['start_time']),
                'end_time'  : int_to_time_str(row['end_time'])
            },
            'building_room': row['building_room'],
            'instructor'   : row['instructor']
        }
        meetings_by_section[row['section_id']].append(meeting_dict)
        
    # 2. Fetch Sections
    cursor.execute("SELECT * FROM sections")
    sections_by_course = defaultdict(list)
    for row in cursor.fetchall():
        # Remove the 'course_id-' prefix to get the raw section_id
        course_prefix_len = len(row['course_id']) + 1
        raw_section_id = row['section_id'][course_prefix_len:] if row['section_id'] else None

        sec_dict = {
            'section_id'         : raw_section_id,
            'is_primary'         : bool(row['is_primary']),
            'SLN'                : row['sln'],
            'section_type'       : row['section_type'],
            'credits_min'        : row['credits_min'],
            'credits_max'        : row['credits_max'],
            'status'             : row['status'],
            'enrolled'           : row['enrolled'],
            'enrollment_limit'   : row['enrollment_limit'],
            'is_limit_estimate'  : bool(row['is_limit_estimate']),
            'is_credit_no_credit': bool(row['is_credit_no_credit']),
            'fee'                : row['fee'],
            'restrictions': {
                'restricted_registration': bool(row['restricted_registration']),
                'add_code_required'      : bool(row['add_code_required']),
                'independent_study'      : bool(row['independent_study'])
            },
            'attributes': {
                'asynchronous'     : bool(row['asynchronous']),
                'hybrid'           : bool(row['hybrid']),
                'online'           : bool(row['online']),
                'community_engaged': bool(row['community_engaged']),
                'honors'           : bool(row['honors']),
                'jointly_offered'  : bool(row['jointly_offered']),
                'research'         : bool(row['research']),
                'service_learning' : bool(row['service_learning']),
                'writing'          : bool(row['writing']),
                'new_course'       : bool(row['new_course']),
                'no_financial_aid' : bool(row['no_financial_aid'])
            },
            'meetings': meetings_by_section.get(row['section_id'], []),
            'notes'   : row['notes']
        }
        sections_by_course[row['course_id']].append(sec_dict)
        
    # 3. Fetch Courses
    cursor.execute("SELECT * FROM courses")
    reconstructed_courses = []
    
    for row in cursor.fetchall():
        course_dict = {
            # Metadata previously passed as function arguments
            'term_code': calculate_term_code(row['year'], row['quarter']), 
            'course_id': row['course_id'],
            
            'year'      : row['year'],
            'quarter'   : row['quarter'],
            'college'   : row['college'],
            'major_name': row['major_name'],
            
              # Reconstructed CourseDict
            'course_prefix'    : row['course_prefix'],
            'course_number'    : row['course_number'],
            'course_title'     : row['course_title'],
            'gen_ed_reqs'      : row['gen_ed_reqs'].split('/') if row['gen_ed_reqs'] else [],
            'has_prerequisites': bool(row['has_prerequisites']),
            'notes'            : row['notes'],
            'sections'         : sections_by_course.get(row['course_id'], [])
        }
        reconstructed_courses.append(course_dict)

    print(f"  -> Reconstructed {len(reconstructed_courses)} total course documents.")
    return reconstructed_courses

def construct_fts(courses: list[dict]) -> list[dict]:
    for c in courses:
        # 1. Gather all searchable text into one giant string per course
        search_terms = [
            c.get('course_prefix', ''),
            str(c.get('course_number', '')),
            c.get('course_title', ''),
            *(c.get('gen_ed_reqs', []))
        ]
        
        # Add sections to grab instructors or SLNs
        for s in c.get('sections', []):
            search_terms.append(str(s.get('SLN', '')))
            for m in s.get('meetings', []):
                if m.get('instructor'):
                    search_terms.append(m['instructor'])
        
        # Clean and assign
        unique_terms = {str(t).strip().lower() for t in search_terms if t}
        c['search_text'] = " ".join(unique_terms)

    # 2. Pre-sort the data! This makes Parquet's automatic Zone Maps hyper-efficient.
    # Adjust this sort logic to match your default UI sort (e.g., newest term, then prefix)
    # courses.sort(key=lambda x: (x['year'], x['quarter'], x['course_prefix'], x['course_number']), reverse=True)
    return courses

# ==========================================
# EXPORT TO PARQUET
# ==========================================

def export_to_parquet(courses: list[dict]):
    """Purely converts nested Python dicts to a Parquet file."""

    print("Converting Python dictionaries to PyArrow Table...")
    # 1. PyArrow converts your nested Python lists/dicts into an Arrow table in memory
    table = pa.Table.from_pylist(courses)
    
    print(f"Writing compressed Parquet file to {DUCKDB_PATH}...")
    # 2. PyArrow writes that memory directly to disk as a Parquet file
    pq.write_table(table, DUCKDB_PATH)
    
    print("Done!")

if __name__ == "__main__":
    stitch_database(DATA_DIR, SQLITE_PATH)
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row  
    cursor = sqlite_conn.cursor()
    
    try:
        # 1. Rebuild the nested dicts from SQLite
        schedule_data = reconstruct_schedule(cursor)
        database_data = construct_fts(schedule_data)

        export_to_parquet(database_data)

        # Write majors table back to JSON
        extract_majors(cursor)
        
    finally:
        sqlite_conn.close()