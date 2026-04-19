import sqlite3
from parse.normalize import NormalizedCourseDict, NormalizedSectionDict

# ==========================================
# SQL SCHEMA DEFINITIONS
# ==========================================

CREATE_MAJORS_TABLE = """
    CREATE TABLE IF NOT EXISTS majors (
        course_prefix TEXT PRIMARY KEY,
        major_name    TEXT,
        major_code    TEXT
    );
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
        
        is_primary      BOOLEAN,
        is_tba          BOOLEAN,
        days_mask       INTEGER,
        attributes_mask INTEGER,
        
        PRIMARY KEY (course_prefix, course_number, term_code, section_id, meeting_index)
    );
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
        has_prerequisites BOOLEAN,
        notes             TEXT
    );
"""

CREATE_SECTIONS_TABLE = """
    CREATE TABLE IF NOT EXISTS sections (
        section_id              TEXT PRIMARY KEY,
        course_id               TEXT,
        is_primary              BOOLEAN,
        sln                     INTEGER,
        section_type            TEXT,
        credits_min             REAL,
        credits_max             REAL,
        status                  TEXT,
        enrolled                INTEGER,
        enrollment_limit        INTEGER,
        is_limit_estimate       BOOLEAN,
        fee                     INTEGER DEFAULT 0,
        notes                   TEXT,
        
        is_credit_no_credit     BOOLEAN,
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
    );
"""

CREATE_MEETINGS_TABLE = """
    CREATE TABLE IF NOT EXISTS meetings (
        meeting_id    INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id    TEXT,
        is_tba        BOOLEAN,
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

def build_days_mask(days_list: list[str]) -> int:
    """Compiles string days into a bitwise integer mask."""
    mask = 0
    if not days_list: return mask
    
    mapping = {'M': 1, 'T': 2, 'W': 4, 'Th': 8, 'F': 16, 'S': 32, 'Su': 64}
    for d in days_list:
        val = mapping.get(d)
        if val: mask |= val
    return mask

def build_attributes_mask(section_data: NormalizedSectionDict) -> int:
    """Compiles all boolean section sprawl into a single Varint mask."""
    mask = 0
    attrs = section_data['attributes']
    restr = section_data['restrictions']
    
    # No more .get(), just direct guaranteed booleans
    if attrs['writing']:                    mask |= 1
    if attrs['honors']:                     mask |= 2
    if attrs['jointly_offered']:            mask |= 4
    if attrs['online']:                     mask |= 8
    if attrs['asynchronous']:               mask |= 16
    if attrs['hybrid']:                     mask |= 32
    if attrs['community_engaged']:          mask |= 64
    if attrs['service_learning']:           mask |= 128
    if attrs['research']:                   mask |= 256
    if attrs['new_course']:                 mask |= 512
    if attrs['no_financial_aid']:           mask |= 1024
      
    if restr['restricted_registration']:    mask |= 2048
    if restr['add_code_required']:          mask |= 4096
    
    if section_data['is_credit_no_credit']: mask |= 8192
    
    return mask

def _db_time(time_str: str | None) -> int | None:
    """Converts 'HH:MM' from normalize.py into integer HHMM."""
    if not time_str: return None
    return int(time_str.replace(':', ''))

# ==========================================
# DATABASE INITIALIZATION
# ==========================================

def init_schedule_db(conn: sqlite3.Connection):
    """Initializes schema and aligns SQLite page size with HTTP-VFS chunk size."""
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

    conn.commit()
        

# ==========================================
# DATA INSERTION
# ==========================================

def insert_schedule_data(
    conn      : sqlite3.Connection,
    quarter   : str,
    year      : int,
    college   : str,
    major_name: str,
    major_code: str,
    courses   : list[NormalizedCourseDict]
):
    """Ingests data into Sieve, FTS5, and Hydration tables."""
    
    # 1. Guard Clause: Abort immediately if there is no data
    if not courses:
        return 
        
    term_code = calculate_term_code(year, quarter)
    
    # 2. Extract ALL unique prefixes from the batch (ignores None/empty values)
    unique_prefixes = {c['course_prefix'].strip() for c in courses if c['course_prefix']}
    
    conn.execute("PRAGMA foreign_keys = ON;")
    cursor = conn.cursor()
    
    # --- TRANSACTIONAL CLEANUP ---
    
    # A. Clean Hydration Table (Runs once, because it's tied to the major_name argument, not the prefix)
    cursor.execute(
        "DELETE FROM courses WHERE year = :year AND quarter = :quarter AND major_name = :major_name", 
        {'year': year, 'quarter': quarter, 'major_name': major_name}
    )
    
    # B. Clean Omni-Search and Sieve (Runs for EVERY unique prefix we are about to insert)
    for prefix in unique_prefixes:
        
        # Clean FTS5
        course_id_pattern = f"{year}-{quarter}-{prefix.replace(' ', '')}-%"
        cursor.execute("DELETE FROM omni_search WHERE course_id LIKE :pattern", {'pattern': course_id_pattern})
        
        # Clean Sieve
        cursor.execute(
            "DELETE FROM filter_discovery WHERE term_code = :term_code AND course_prefix = :course_prefix",
            {'term_code': term_code, 'course_prefix': prefix}
        )
    
    # --- DATA INGESTION ---
    for c in courses:
        course_id = f"{year}-{quarter}-{c['course_prefix'].replace(' ','')}-{c['course_number']}"
        
        # 1. Majors Table
        cursor.execute(
            "INSERT OR IGNORE INTO majors (course_prefix, major_name, major_code) VALUES (:course_prefix, :major_name, :major_code)",
            {'course_prefix': c['course_prefix'], 'major_name': major_name, 'major_code': major_code}
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
            'course_prefix'    : c['course_prefix'],
            'course_number'    : c['course_number'],
            'course_title'     : c['course_title'],
            'gen_ed_reqs'      : "/".join(c['gen_ed_reqs']),
            'has_prerequisites': c['has_prerequisites'], 
            'notes'            : c['notes']
        })

        # --- PREP OMNI-SEARCH TEXT ---
        # Dump raw primitives in blindly. We will clean this up later.
        search_terms = [c['course_prefix'], c['course_number'], c['course_title'], *c['gen_ed_reqs']]
        
        # 3. Sections Table (Hydration)
        for s in c['sections']:
            section_id = f"{course_id}-{s['section_id']}"
            
            r = s['restrictions']
            a = s['attributes']
            
            # Dump raw SLN (int or None) into search terms
            search_terms.append(s['SLN'])
            
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
                'is_primary'             : s['is_primary'],
                'sln'                    : s['SLN'],
                'section_type'           : s['section_type'],
                'credits_min'            : s['credits_min'],
                'credits_max'            : s['credits_max'],
                'status'                 : s['status'],
                'enrolled'               : s['enrolled'],
                'enrollment_limit'       : s['enrollment_limit'],
                'is_limit_estimate'      : s['is_limit_estimate'],
                'fee'                    : s['fee'] or 0, 
                'notes'                  : s['notes'],
                'is_credit_no_credit'    : s['is_credit_no_credit'],
                'restricted_registration': r['restricted_registration'],
                'add_code_required'      : r['add_code_required'],
                'independent_study'      : r['independent_study'],
                'asynchronous'           : a['asynchronous'],
                'hybrid'                 : a['hybrid'],
                'online'                 : a['online'],
                'community_engaged'      : a['community_engaged'],
                'honors'                 : a['honors'],
                'jointly_offered'        : a['jointly_offered'],
                'research'               : a['research'],
                'service_learning'       : a['service_learning'],
                'writing'                : a['writing'],
                'new_course'             : a['new_course'],
                'no_financial_aid'       : a['no_financial_aid']
            })
            
            attr_mask = build_attributes_mask(s)
            meetings = s['meetings']
            
            if not meetings:
                meetings = [{
                    'time'         : {'is_tba': True, 'days': [], 'start_time': None, 'end_time': None},
                    'building_room': None,
                    'instructor'   : None
                }]

            # 4. Meetings Table & Discovery Sieve Table
            for m_index, m in enumerate(meetings):
                t    = m['time']
                days = t['days']
                
                # Dump raw locations and instructors into search terms
                search_terms.extend([m['building_room'], m['instructor']])
                
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
                    'course_prefix'  : c['course_prefix'],
                    'course_number'  : c['course_number'],
                    'term_code'      : term_code,
                    'course_id'      : course_id,
                    'section_id'     : section_id,
                    'meeting_index'  : m_index,
                    'section_type'   : s['section_type'],
                    'credits_min'    : s['credits_min'],
                    'credits_max'    : s['credits_max'],
                    'fee'            : s['fee'] or 0,
                    'start_time'     : _db_time(t['start_time']),
                    'end_time'       : _db_time(t['end_time']),
                    'is_primary'     : s['is_primary'],
                    'is_tba'         : t['is_tba'],
                    'days_mask'      : build_days_mask(days),
                    'attributes_mask': attr_mask
                })
                
                # B) Insert into Meetings (Hydration)
                # Only insert into the real UI table if real meetings exist!
                if s['meetings']:
                    cursor.execute("""
                        INSERT INTO meetings (
                            section_id, is_tba, days, start_time, end_time, building_room, instructor
                        ) VALUES (
                            :section_id, :is_tba, :days, :start_time, :end_time, :building_room, :instructor
                        )
                    """, {
                        'section_id'   : section_id,
                        'is_tba'       : t['is_tba'],
                        'days'         : "".join(days) if days else None,
                        'start_time'   : _db_time(t['start_time']),
                        'end_time'     : _db_time(t['end_time']),
                        'building_room': m['building_room'],
                        'instructor'   : m['instructor']
                    })
        
        # 5. Insert into Omni Search (FTS5)
        # Centralized Cleanup:
        # 1. 'if t' removes None, empty strings, and empty lists.
        # 2. 'str(t).strip()' normalizes ints and cleans up stray whitespace strings.
        # 3. Using a Set {} automatically deduplicates identical strings.
        unique_terms = {str(t).strip() for t in search_terms if t}
        unique_terms.discard("") # Failsafe: removes an empty string if str(" ").strip() created one
        
        search_text = " ".join(unique_terms)
        
        cursor.execute("""
            INSERT INTO omni_search (course_id, search_text) 
            VALUES (:course_id, :search_text)
        """, {
            'course_id'  : course_id,
            'search_text': search_text
        })
        
    conn.commit()