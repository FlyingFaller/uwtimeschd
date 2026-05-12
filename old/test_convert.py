import pyarrow as pa
import pyarrow.dataset as ds
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
DATA_DIR      = "data"
SQLITE_PATH   = os.path.join(DATA_DIR, "schedules.db")
DATASET_DIR   = os.path.join(DATA_DIR, "schedules_dataset")
REGISTRY_JSON = os.path.join(DATA_DIR, "registry.json")

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

def reconstruct_data(cursor: sqlite3.Cursor) -> tuple[list[dict], dict]:
    """Reconstructs the courses and the new JSON registry simultaneously."""
    print("Reconstructing nested course structure and building registry...")
    
    # 1. Fetch Old Majors to build mapping (Prefix -> Major Code)
    cursor.execute("SELECT course_prefix, major_code FROM majors")
    prefix_to_code = {row['course_prefix']: row['major_code'] for row in cursor.fetchall()}
    
    # 2. Fetch Meetings
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
        
    # 3. Fetch Sections
    cursor.execute("SELECT * FROM sections")
    sections_by_course = defaultdict(list)
    for row in cursor.fetchall():
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
        
    # 4. Fetch Courses & Build Registry
    cursor.execute("SELECT * FROM courses")
    reconstructed_courses = []
    registry = {}
    
    for row in cursor.fetchall():
        prefix = row['course_prefix']
        major_code = prefix_to_code.get(prefix, prefix.lower().replace(' ', ''))
        
        # --- BUILD REGISTRY ENTRY ---
        if major_code not in registry:
            registry[major_code] = {
                "major_name": row['major_name'],
                "college": row['college'],
                "prefixes": defaultdict(int)
            }
        # Tally the prefix frequency
        registry[major_code]["prefixes"][prefix] += 1
        
        # --- BUILD BLIND COURSE DICT ---
        # Note: Deliberately omitting year, quarter, major_name, college, and major_code
        course_dict = {
            'term_code'        : calculate_term_code(row['year'], row['quarter']), 
            'course_id'        : row['course_id'],
            'course_prefix'    : prefix,
            'course_number'    : row['course_number'],
            'course_title'     : row['course_title'],
            'gen_ed_reqs'      : row['gen_ed_reqs'].split('/') if row['gen_ed_reqs'] else [],
            'has_prerequisites': bool(row['has_prerequisites']),
            'notes'            : row['notes'],
            'sections'         : sections_by_course.get(row['course_id'], [])
        }
        reconstructed_courses.append(course_dict)

    # Convert registry defaultdicts to standard dicts for JSON serialization
    for code in registry:
        registry[code]["prefixes"] = dict(registry[code]["prefixes"])

    print(f"  -> Reconstructed {len(reconstructed_courses)} courses and {len(registry)} registry entries.")
    return reconstructed_courses, registry

def construct_fts(courses: list[dict]) -> list[dict]:
    """Generates the FTS string and sorts the data for Parquet Zone Maps."""
    for c in courses:
        search_terms = [
            c.get('course_prefix', ''),
            str(c.get('course_number', '')),
            c.get('course_title', ''),
            *(c.get('gen_ed_reqs', []))
        ]
        
        for s in c.get('sections', []):
            search_terms.append(str(s.get('SLN', '')))
            for m in s.get('meetings', []):
                if m.get('instructor'):
                    search_terms.append(m['instructor'])
        
        unique_terms = {str(t).strip().lower() for t in search_terms if t}
        unique_terms.discard("")
        c['search_text'] = " ".join(unique_terms)

    # Sort using term_code instead of year/quarter
    courses.sort(key=lambda x: (x['term_code'], x['course_prefix'], x['course_number']), reverse=True)
    return courses

# ==========================================
# EXPORT
# ==========================================

def export_to_parquet(courses: list[dict]):
    print(f"Writing chunked Parquet dataset to {DATASET_DIR}...")
    table = pa.Table.from_pylist(courses)
    
    os.makedirs(DATASET_DIR, exist_ok=True)
    ds.write_dataset(
        data=table,
        base_dir=DATASET_DIR,
        format="parquet",
        max_rows_per_file=450_000,
        max_rows_per_group=450_000, 
        existing_data_behavior="overwrite_or_ignore"
    )
    
    # --- NEW: Generate manifest.json for DuckDB-Wasm ---
    parquet_files = [f for f in os.listdir(DATASET_DIR) if f.endswith('.parquet')]
    parquet_files.sort()
    
    manifest_path = os.path.join(DATASET_DIR, "manifest.json")
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump({"files": parquet_files}, f, indent=4)
        
    print(f"Done! Generated manifest with {len(parquet_files)} files.")

def export_registry(registry: dict):
    print(f"Writing metadata registry to {REGISTRY_JSON}...")
    os.makedirs(os.path.dirname(REGISTRY_JSON), exist_ok=True)
    with open(REGISTRY_JSON, 'w', encoding='utf-8') as f:
        json.dump(registry, f, indent=4)
    print("Done!")

if __name__ == "__main__":
    # Ensure the SQLite database is reassembled if it was chunked
    stitch_database(DATA_DIR, SQLITE_PATH)
    
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row  
    cursor = sqlite_conn.cursor()
    
    try:
        # 1. Rebuild dicts and dynamic registry mapping
        schedule_data, new_registry = reconstruct_data(cursor)
        
        # 2. Add FTS and sort
        database_data = construct_fts(schedule_data)

        # 3. Export to new formats
        export_to_parquet(database_data)
        export_registry(new_registry)
        
    finally:
        sqlite_conn.close()