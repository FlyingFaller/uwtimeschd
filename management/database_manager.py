import sqlite3
import os

# ==========================================
# SQL SCHEMA DEFINITIONS
# ==========================================

CREATE_MAJORS_TABLE = """
    CREATE TABLE IF NOT EXISTS majors (
        course_prefix TEXT PRIMARY KEY,
        major_name    TEXT,
        major_code    TEXT
    ) WITHOUT ROWID;
"""

# --- THE SIEVE (SEARCH INDEX) ---
# Flattened down to the meeting grain. Dense numeric data only.
CREATE_DISCOVERY_TABLE = """
    CREATE TABLE IF NOT EXISTS filter_discovery (
        course_prefix   TEXT,
        course_number   INTEGER,
        term_code       INTEGER,
        course_id       TEXT,
        section_id      TEXT,
        meeting_index   INTEGER, -- Ensures uniqueness for multiple meetings per section
        
        section_type    TEXT,
        credits_min     REAL,
        credits_max     REAL,
        fee             INTEGER,
        start_time      INTEGER,
        end_time        INTEGER,
        
        is_primary      INTEGER,
        is_tba          INTEGER,
        days_mask       INTEGER,
        attributes_mask INTEGER,
        
        PRIMARY KEY (course_prefix, course_number, term_code, section_id, meeting_index)
    ) WITHOUT ROWID;
"""

# --- THE OMNI-SEARCH INDEX (FTS5) ---
# Inverted index for ultra-fast, chunk-aligned text queries.
CREATE_OMNI_SEARCH_TABLE = """
    CREATE VIRTUAL TABLE IF NOT EXISTS omni_search USING fts5(
        course_id UNINDEXED, 
        search_text
    );
"""

# --- THE HYDRATION TABLES (UI DATA) ---
# Normalizes heavy text to avoid bloating the Sieve network requests.
CREATE_COURSES_TABLE = """
    CREATE TABLE IF NOT EXISTS courses (
        course_id         TEXT PRIMARY KEY,
        term_code         INTEGER,
        year              INTEGER,
        quarter           TEXT,
        college           TEXT,
        major_name        TEXT,
        course_prefix     TEXT,
        course_number     INTEGER,
        course_title      TEXT,
        gen_ed_reqs       TEXT,
        has_prerequisites INTEGER,
        notes             TEXT
    ) WITHOUT ROWID;
"""

CREATE_SECTIONS_TABLE = """
    CREATE TABLE IF NOT EXISTS sections (
        section_id              TEXT PRIMARY KEY,
        course_id               TEXT,
        is_primary              INTEGER,
        sln                     INTEGER,
        section_type            TEXT,
        credits_min             REAL,
        credits_max             REAL,
        status                  TEXT,
        enrolled                INTEGER,
        enrollment_limit        INTEGER,
        is_limit_estimate       INTEGER,
        fee                     INTEGER DEFAULT 0,
        notes                   TEXT,
        
        is_credit_no_credit     INTEGER,
        restricted_registration INTEGER,
        add_code_required       INTEGER,
        independent_study       INTEGER,
        asynchronous            INTEGER,
        hybrid                  INTEGER,
        online                  INTEGER,
        community_engaged       INTEGER,
        honors                  INTEGER,
        jointly_offered         INTEGER,
        research                INTEGER,
        service_learning        INTEGER,
        writing                 INTEGER,
        new_course              INTEGER,
        no_financial_aid        INTEGER,
        
        FOREIGN KEY(course_id) REFERENCES courses(course_id) ON DELETE CASCADE
    ) WITHOUT ROWID;
"""

CREATE_MEETINGS_TABLE = """
    CREATE TABLE IF NOT EXISTS meetings (
        meeting_id    INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id    TEXT,
        is_tba        INTEGER,
        days          TEXT,
        start_time    INTEGER,
        end_time      INTEGER,
        building_room TEXT,
        instructor    TEXT,
        
        FOREIGN KEY(section_id) REFERENCES sections(section_id) ON DELETE CASCADE
    );
"""

# ==========================================
# DATA TRANSFORM HELPERS
# ==========================================

def calculate_term_code(year: int, quarter: str) -> int:
    """Converts 2024 'AUT' into 20244 for fast integer sorting."""
    weights = {"WIN": 1, "SPR": 2, "SUM": 3, "AUT": 4}
    weight = weights.get(quarter.upper(), 0)
    return int(f"{year}{weight}")

def build_days_mask(days_list: list) -> int:
    """Compiles string days into a bitwise integer mask."""
    mask = 0
    if not days_list: return mask
    
    mapping = {'M': 1, 'T': 2, 'W': 4, 'Th': 8, 'F': 16, 'S': 32, 'Su': 64}
    for d in days_list:
        val = mapping.get(d)
        if val: mask |= val
    return mask

def build_attributes_mask(section_data: dict) -> int:
    """Compiles all boolean section sprawl into a single Varint mask."""
    mask = 0
    attrs = section_data.get('attributes', {})
    restr = section_data.get('restrictions', {})
    
    if attrs.get('writing'):                    mask |= 1
    if attrs.get('honors'):                     mask |= 2
    if attrs.get('jointly_offered'):            mask |= 4
    if attrs.get('online'):                     mask |= 8
    if attrs.get('asynchronous'):               mask |= 16
    if attrs.get('hybrid'):                     mask |= 32
    if attrs.get('community_engaged'):          mask |= 64
    if attrs.get('service_learning'):           mask |= 128
    if attrs.get('research'):                   mask |= 256
    if attrs.get('new_course'):                 mask |= 512
    if attrs.get('no_financial_aid'):           mask |= 1024
      
    if restr.get('restricted_registration'):    mask |= 2048
    if restr.get('add_code_required'):          mask |= 4096
    
    if section_data.get('is_credit_no_credit'): mask |= 8192
    
    return mask

def _db_time(time_str: str) -> int | None:
    """Converts 'HH:MM' from normalize.py into integer HHMM."""
    if not time_str: return None
    return int(time_str.replace(':', ''))

# ==========================================
# DATABASE INITIALIZATION
# ==========================================

def init_schedule_db(db_path: str = "data/schedules.db"):
    """Initializes schema and aligns SQLite page size with HTTP-VFS chunk size."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    with sqlite3.connect(db_path) as conn:
        # Crucial for HTTP-VFS alignment
        conn.execute("PRAGMA page_size = 4096;")
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()
        
        cursor.execute(CREATE_MAJORS_TABLE)
        cursor.execute(CREATE_DISCOVERY_TABLE)
        cursor.execute(CREATE_OMNI_SEARCH_TABLE)
        cursor.execute(CREATE_COURSES_TABLE)
        cursor.execute(CREATE_SECTIONS_TABLE)
        cursor.execute(CREATE_MEETINGS_TABLE)
        
        # # Sieve Indexes for fast Global Sorting
        # cursor.execute("CREATE INDEX IF NOT EXISTS idx_discovery_time ON filter_discovery(term_code DESC, course_prefix ASC, course_number ASC);")

        # 1. Base Time Sort (Used on initial load or general filtering)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_discovery_time ON filter_discovery(term_code DESC, course_prefix ASC, course_number ASC, course_id);")
        
        # 2. Major Filter (Used when a specific department is checked)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_discovery_major ON filter_discovery(course_prefix, term_code DESC, course_number ASC, course_id);")
        
        # 3. Level Filter (Used when a specific course level is clicked)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_discovery_level ON filter_discovery(course_number, term_code DESC, course_prefix ASC, course_id);")
        
        # 4. Omni-Search FTS Intersection (Used when searching by text)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_discovery_fts_id ON filter_discovery(course_id, term_code DESC, course_prefix ASC, course_number ASC);")

        # Hydration Indexes for fast Joins
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sections_cid ON sections(course_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_meetings_sid ON meetings(section_id);")
        
        # Rewrite the file using the new page_size if it was created differently
        conn.execute("VACUUM;")
        conn.commit()

# ==========================================
# DATA INSERTION
# ==========================================

def insert_schedule_data(
    quarter   : str,
    year      : int,
    college   : str,
    major_name: str,
    major_code: str,
    courses   : list[dict],
    db_path   : str = "data/schedules.db"
):
    """Ingests data into Sieve, FTS5, and Hydration tables."""
    init_schedule_db(db_path)
    term_code = calculate_term_code(year, quarter)
    prefix = courses[0].get('course_prefix', '').strip() if courses else ''
    
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()
        
        # --- TRANSACTIONAL CLEANUP ---
        # 1. Clean FTS5 (Pattern match on course_id format)
        course_id_pattern = f"{year}-{quarter}-{prefix.replace(' ', '')}-%"
        cursor.execute("DELETE FROM omni_search WHERE course_id LIKE :pattern", {'pattern': course_id_pattern})
        
        # 2. Clean Hydration tables (Cascades to sections/meetings)
        cursor.execute(
            "DELETE FROM courses WHERE year = :year AND quarter = :quarter AND major_name = :major_name", 
            {'year': year, 'quarter': quarter, 'major_name': major_name}
        )
        
        # 3. Clean Sieve
        cursor.execute(
            "DELETE FROM filter_discovery WHERE term_code = :term_code AND course_prefix = :course_prefix",
            {'term_code': term_code, 'course_prefix': prefix}
        )
        
        # --- DATA INGESTION ---
        for c in courses:
            course_id = f"{year}-{quarter}-{prefix.replace(' ','')}-{c.get('course_number')}"
            
            # 1. Majors Table
            cursor.execute(
                "INSERT OR IGNORE INTO majors (course_prefix, major_name, major_code) VALUES (:course_prefix, :major_name, :major_code)",
                {'course_prefix': prefix, 'major_name': major_name, 'major_code': major_code}
            )
            
            # 2. Courses Table (Hydration)
            cursor.execute("""
                INSERT INTO courses (
                    course_id, term_code, year, quarter, college, major_name,
                    course_prefix, course_number, course_title, gen_ed_reqs, has_prerequisites, notes
                ) VALUES (
                    :course_id, :term_code, :year, :quarter, :college, :major_name,
                    :course_prefix, :course_number, :course_title, :gen_ed_reqs, :has_prerequisites, :notes
                )
            """, {
                'course_id'        : course_id,
                'term_code'        : term_code,
                'year'             : year,
                'quarter'          : quarter,
                'college'          : college,
                'major_name'       : major_name,
                'course_prefix'    : prefix,
                'course_number'    : c.get('course_number'),
                'course_title'     : c.get('course_title'),
                'gen_ed_reqs'      : "/".join(c.get('gen_ed_reqs', [])),
                'has_prerequisites': int(c.get('has_prerequisites', False)),
                'notes'            : c.get('notes')
                }
            )

            # --- PREP OMNI-SEARCH TEXT ---
            search_terms = [prefix, str(c.get('course_number')), c.get('course_title')]
            
            # 3. Sections Table (Hydration)
            for s in c.get('sections', []):
                section_id = f"{course_id}-{s.get('section_id')}"
                r = s.get('restrictions', {})
                a = s.get('attributes', {})
                
                if s.get('SLN'): search_terms.append(str(s['SLN']))
                
                cursor.execute("""
                    INSERT INTO sections (
                        section_id, course_id, is_primary, sln, section_type, credits_min, credits_max,
                        status, enrolled, enrollment_limit, is_limit_estimate, fee, notes,
                        is_credit_no_credit, restricted_registration, add_code_required, independent_study,
                        asynchronous, hybrid, online, community_engaged, honors, jointly_offered,
                        research, service_learning, writing, new_course, no_financial_aid
                    ) VALUES (
                        :section_id, :course_id, :is_primary, :sln, :section_type, :credits_min, :credits_max,
                        :status, :enrolled, :enrollment_limit, :is_limit_estimate, :fee, :notes,
                        :is_credit_no_credit, :restricted_registration, :add_code_required, :independent_study,
                        :asynchronous, :hybrid, :online, :community_engaged, :honors, :jointly_offered,
                        :research, :service_learning, :writing, :new_course, :no_financial_aid
                    )
                """, {
                    'section_id'             : section_id,
                    'course_id'              : course_id,
                    'is_primary'             : int(s.get('is_primary', False)),
                    'sln'                    : s.get('SLN'),
                    'section_type'           : s.get('section_type'),
                    'credits_min'            : s.get('credits_min'),
                    'credits_max'            : s.get('credits_max'),
                    'status'                 : s.get('status'),
                    'enrolled'               : s.get('enrolled'),
                    'enrollment_limit'       : s.get('enrollment_limit'),
                    'is_limit_estimate'      : int(s.get('is_limit_estimate', False)),
                    'fee'                    : s.get('fee', 0),
                    'notes'                  : s.get('notes'),
                    'is_credit_no_credit'    : int(s.get('is_credit_no_credit', False)),
                    'restricted_registration': int(r.get('restricted_registration', False)),
                    'add_code_required'      : int(r.get('add_code_required', False)),
                    'independent_study'      : int(r.get('independent_study', False)),
                    'asynchronous'           : int(a.get('asynchronous', False)),
                    'hybrid'                 : int(a.get('hybrid', False)),
                    'online'                 : int(a.get('online', False)),
                    'community_engaged'      : int(a.get('community_engaged', False)),
                    'honors'                 : int(a.get('honors', False)),
                    'jointly_offered'        : int(a.get('jointly_offered', False)),
                    'research'               : int(a.get('research', False)),
                    'service_learning'       : int(a.get('service_learning', False)),
                    'writing'                : int(a.get('writing', False)),
                    'new_course'             : int(a.get('new_course', False)),
                    'no_financial_aid'       : int(a.get('no_financial_aid', False))
                    }
                )
                
                # Pre-calculate masks for the Sieve
                attr_mask = build_attributes_mask(s)
                meetings = s.get('meetings', [])
                
                # If a section is purely async with no assigned meeting, we must insert a dummy Sieve row
                if not meetings:
                    meetings = [{'time': {'is_tba': True, 'days': [], 'start_time': None, 'end_time': None}}]

                # 4. Meetings Table & Discovery Sieve Table
                for m_index, m in enumerate(meetings):
                    t = m.get('time', {})
                    days = t.get('days', [])
                    
                    if m.get('building_room'): search_terms.append(m['building_room'])
                    if m.get('instructor')   : search_terms.append(m['instructor'])
                    
                    # A) Insert into Sieve (filter_discovery)
                    cursor.execute("""
                        INSERT INTO filter_discovery (
                            course_prefix, course_number, term_code, course_id, section_id, meeting_index,
                            section_type, credits_min, credits_max, fee, start_time, end_time,
                            is_primary, is_tba, days_mask, attributes_mask
                        ) VALUES (
                            :course_prefix, :course_number, :term_code, :course_id, :section_id, :meeting_index,
                            :section_type, :credits_min, :credits_max, :fee, :start_time, :end_time,
                            :is_primary, :is_tba, :days_mask, :attributes_mask
                        )
                    """, {
                        'course_prefix'  : prefix,
                        'course_number'  : c.get('course_number'),
                        'term_code'      : term_code,
                        'course_id'      : course_id,
                        'section_id'     : section_id,
                        'meeting_index'  : m_index,
                        'section_type'   : s.get('section_type'),
                        'credits_min'    : s.get('credits_min'),
                        'credits_max'    : s.get('credits_max'),
                        'fee'            : s.get('fee', 0),
                        'start_time'     : _db_time(t.get('start_time')),
                        'end_time'       : _db_time(t.get('end_time')),
                        'is_primary'     : int(s.get('is_primary', False)),
                        'is_tba'         : int(t.get('is_tba', False)),
                        'days_mask'      : build_days_mask(days),
                        'attributes_mask': attr_mask
                        }
                    )
                    
                    # B) Insert into Meetings (Hydration)
                    # We skip inserting pure dummy meetings into the actual UI table
                    if not (m_index == 0 and not s.get('meetings')):
                        cursor.execute("""
                            INSERT INTO meetings (
                                section_id, is_tba, days, start_time, end_time, building_room, instructor
                            ) VALUES (
                                :section_id, :is_tba, :days, :start_time, :end_time, :building_room, :instructor
                            )
                        """, {
                            'section_id'   : section_id,
                            'is_tba'       : int(t.get('is_tba', False)),
                            'days'         : "".join(days) if days else None,
                            'start_time'   : _db_time(t.get('start_time')),
                            'end_time'     : _db_time(t.get('end_time')),
                            'building_room': m.get('building_room'),
                            'instructor'   : m.get('instructor')
                            }
                        )
            
            # 5. Insert into Omni Search (FTS5)
            # Deduplicate and remove empty strings to keep index lean
            unique_terms = list(set(filter(None, search_terms)))
            search_text = " ".join(unique_terms)
            
            cursor.execute("""
                INSERT INTO omni_search (course_id, search_text) 
                VALUES (:course_id, :search_text)
            """, {
                'course_id': course_id,
                'search_text': search_text
                }
            )
            
        conn.commit()