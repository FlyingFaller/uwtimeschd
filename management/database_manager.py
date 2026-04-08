import sqlite3
import os
import re

# ==========================================
# SQL SCHEMA DEFINITIONS
# ==========================================

CREATE_MAJORS_TABLE = """
    CREATE TABLE IF NOT EXISTS majors (
        course_prefix TEXT PRIMARY KEY,
        major_name    TEXT
    )
"""

CREATE_COURSES_TABLE = """
    CREATE TABLE IF NOT EXISTS courses (
        course_id         TEXT PRIMARY KEY,
        year              INTEGER,
        quarter           TEXT,
        college           TEXT,
        major_name        TEXT,
        course_prefix     TEXT,
        course_number     INTEGER,
        course_title      TEXT,
        has_prerequisites BOOLEAN,
        notes             TEXT
    )
"""

CREATE_SECTIONS_TABLE = """
    CREATE TABLE IF NOT EXISTS sections (
        section_id              TEXT PRIMARY KEY,
        is_primary              BOOLEAN,
        course_id               TEXT,
        sln                     INTEGER,
        section_type            TEXT,
        credits_min             REAL,
        credits_max             REAL,
        status                  TEXT,
        enrolled                INTEGER,
        enrollment_limit        INTEGER,
        is_limit_estimate       BOOLEAN,
        is_credit_no_credit     BOOLEAN,
        fee                     INTEGER DEFAULT 0,
        notes                   TEXT,
        
        restricted_registration BOOLEAN,
        add_code_required       BOOLEAN,
        independent_study       BOOLEAN,
        
        asynchronous            BOOLEAN,
        hybrid                  BOOLEAN,
        online                  BOOLEAN,
        community_engaged       BOOLEAN,
        honors                  BOOLEAN,
        jointly_offered         BOOLEAN,
        research                BOOLEAN,
        service_learning        BOOLEAN,
        writing                 BOOLEAN,
        new_course              BOOLEAN,
        no_financial_aid        BOOLEAN,
        
        FOREIGN KEY(course_id) REFERENCES courses(course_id) ON DELETE CASCADE
    )
"""

CREATE_MEETINGS_TABLE = """
    CREATE TABLE IF NOT EXISTS meetings (
        meeting_id    INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id    TEXT,
        is_tba        BOOLEAN,
        days          TEXT,
        meets_m       BOOLEAN DEFAULT 0,
        meets_t       BOOLEAN DEFAULT 0,
        meets_w       BOOLEAN DEFAULT 0,
        meets_th      BOOLEAN DEFAULT 0,
        meets_f       BOOLEAN DEFAULT 0,
        start_time    INTEGER,
        end_time      INTEGER,
        building_room TEXT,
        instructor    TEXT,
        
        FOREIGN KEY(section_id) REFERENCES sections(section_id) ON DELETE CASCADE
    )
"""

# ==========================================
# HELPERS
# ==========================================

def _db_time(time_str):
    """Converts 'HH:MM' from normalize.py into integer HHMM for indexing."""
    if not time_str:
        return None
    return int(time_str.replace(':', ''))

def _map_days(days_list):
    """Maps list ['M', 'W'] to boolean flags for meeting columns."""
    flags = {"m": False, "t": False, "w": False, "th": False, "f": False}
    if not days_list:
        return flags
    
    # normalize.py already handles 'Th' vs 'T' parsing correctly
    for d in days_list:
        d_low = d.lower()
        if d_low in flags:
            flags[d_low] = True
    return flags

# ==========================================
# DATABASE INITIALIZATION
# ==========================================

def init_schedule_db(db_path: str = "data/schedules.db"):
    """Initializes optimized tables and indices for Range Request performance."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()
        
        cursor.execute(CREATE_MAJORS_TABLE)
        cursor.execute(CREATE_COURSES_TABLE)
        cursor.execute(CREATE_SECTIONS_TABLE)
        cursor.execute(CREATE_MEETINGS_TABLE)
        
        # Essential Indices for Joins
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sections_cid ON sections(course_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_meetings_sid ON meetings(section_id);")
        
        # Essential Indices for Sidebar Filters
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_course_lookup ON courses(course_prefix, course_number);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sect_primary ON sections(is_primary);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_mtg_time ON meetings(start_time, end_time);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_mtg_tba ON meetings(is_tba);")
        
        for d in ['m', 't', 'w', 'th', 'f']:
            cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_mtg_day_{d} ON meetings(meets_{d});")
        
        conn.commit()

# ==========================================
# DATA INSERTION
# ==========================================

def insert_schedule_data(
    quarter: str, 
    year: int, 
    college: str, 
    major_name: str, 
    courses: list[dict], 
    db_path: str = "data/schedules.db"
):
    """Ingests data normalized by normalize.py into the relational schema."""
    init_schedule_db(db_path)
    
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()
        
        # Transactional delete of old data for this major/quarter
        cursor.execute(
            "DELETE FROM courses WHERE year = :year AND quarter = :quarter AND major_name = :major_name", 
            {'year': year, 'quarter': quarter, 'major_name': major_name}
        )
        
        for c in courses:
            prefix = c.get('course_prefix', '').strip()
            course_id = f"{year}-{quarter}-{prefix.replace(' ','')}-{c.get('course_number')}"
            
            # 1. Update Majors Table (Instant sidebar loading)
            cursor.execute(
                "INSERT OR IGNORE INTO majors (course_prefix, major_name) VALUES (:course_prefix, :major_name)",
                {'course_prefix': prefix, 'major_name': major_name}
            )
            
            # 2. Insert Course
            cursor.execute("""
                INSERT INTO courses (
                    course_id, year, quarter, college, major_name,
                    course_prefix, course_number, course_title, has_prerequisites, notes
                ) VALUES (
                    :course_id, :year, :quarter, :college, :major_name,
                    :course_prefix, :course_number, :course_title, :has_prerequisites, :notes
                )
            """, {
                'course_id': course_id,
                'year': year,
                'quarter': quarter,
                'college': college,
                'major_name': major_name,
                'course_prefix': prefix,
                'course_number': c.get('course_number'),
                'course_title': c.get('course_title'),
                'has_prerequisites': c.get('has_prerequisites', False),
                'notes': c.get('notes')
            })
            
            # 3. Insert Sections
            for s in c.get('sections', []):
                section_id = f"{course_id}-{s.get('section_id')}"
                r = s.get('restrictions', {})
                a = s.get('attributes', {})
                
                cursor.execute("""
                    INSERT INTO sections (
                        section_id, is_primary, course_id, sln, section_type, credits_min, credits_max,
                        status, enrolled, enrollment_limit, is_limit_estimate, is_credit_no_credit, fee, notes,
                        restricted_registration, add_code_required, independent_study,
                        asynchronous, hybrid, online, community_engaged, honors, jointly_offered,
                        research, service_learning, writing, new_course, no_financial_aid
                    ) VALUES (
                        :section_id, :is_primary, :course_id, :sln, :section_type, :credits_min, :credits_max,
                        :status, :enrolled, :enrollment_limit, :is_limit_estimate, :is_credit_no_credit, :fee, :notes,
                        :restricted_registration, :add_code_required, :independent_study,
                        :asynchronous, :hybrid, :online, :community_engaged, :honors, :jointly_offered,
                        :research, :service_learning, :writing, :new_course, :no_financial_aid
                    )
                """, {
                    'section_id': section_id,
                    'is_primary': s.get('is_primary', False),
                    'course_id': course_id,
                    'sln': s.get('SLN'),
                    'section_type': s.get('section_type'),
                    'credits_min': s.get('credits_min'),
                    'credits_max': s.get('credits_max'),
                    'status': s.get('status'),
                    'enrolled': s.get('enrolled'),
                    'enrollment_limit': s.get('enrollment_limit'),
                    'is_limit_estimate': s.get('is_limit_estimate', False),
                    'is_credit_no_credit': s.get('is_credit_no_credit', False),
                    'fee': s.get('fee', 0),
                    'notes': s.get('notes'),
                    'restricted_registration': r.get('restricted_registration', False),
                    'add_code_required': r.get('add_code_required', False),
                    'independent_study': r.get('independent_study', False),
                    'asynchronous': a.get('asynchronous', False),
                    'hybrid': a.get('hybrid', False),
                    'online': a.get('online', False),
                    'community_engaged': a.get('community_engaged', False),
                    'honors': a.get('honors', False),
                    'jointly_offered': a.get('jointly_offered', False),
                    'research': a.get('research', False),
                    'service_learning': a.get('service_learning', False),
                    'writing': a.get('writing', False),
                    'new_course': a.get('new_course', False),
                    'no_financial_aid': a.get('no_financial_aid', False)
                })
                
                # 4. Insert Meetings
                for m in s.get('meetings', []):
                    t = m.get('time', {})
                    days = t.get('days', [])
                    df = _map_days(days)
                    
                    cursor.execute("""
                        INSERT INTO meetings (
                            section_id, is_tba, days, meets_m, meets_t, meets_w, meets_th, meets_f,
                            start_time, end_time, building_room, instructor
                        ) VALUES (
                            :section_id, :is_tba, :days, :meets_m, :meets_t, :meets_w, :meets_th, :meets_f,
                            :start_time, :end_time, :building_room, :instructor
                        )
                    """, {
                        'section_id': section_id,
                        'is_tba': t.get('is_tba', False),
                        'days': "".join(days) if days else None,
                        'meets_m': df['m'],
                        'meets_t': df['t'],
                        'meets_w': df['w'],
                        'meets_th': df['th'],
                        'meets_f': df['f'],
                        'start_time': _db_time(t.get('start_time')),
                        'end_time': _db_time(t.get('end_time')),
                        'building_room': m.get('building_room'),
                        'instructor': m.get('instructor')
                    })
        
        conn.commit()