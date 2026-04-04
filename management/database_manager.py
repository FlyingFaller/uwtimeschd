import sqlite3
import os

def init_schedule_db(db_path: str = "data/schedules.db"):
    """Initializes the 3-table normalized search database."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    with sqlite3.connect(db_path) as conn:
        # Crucial: SQLite disables foreign keys by default. We must turn them on.
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()
        
        # TABLE 1: Courses
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS courses 
            (
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
        """)
        
        # TABLE 2: Sections (Notice the flattened boolean columns!)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sections 
            (
                section_id              TEXT PRIMARY KEY,
                course_id               TEXT,
                sln                     INTEGER,
                section_type            TEXT,
                credits_min             INTEGER,
                credits_max             INTEGER,
                status                  TEXT,
                enrolled                INTEGER,
                enrollment_limit        INTEGER,
                is_limit_estimate       BOOLEAN,
                is_credit_no_credit     BOOLEAN,
                fee                     INTEGER,
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
        """)
        
        # TABLE 3: Meetings
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS meetings 
            (
                meeting_id    INTEGER PRIMARY KEY AUTOINCREMENT,
                section_id    TEXT,
                is_tba        BOOLEAN,
                days          TEXT,
                start_time    TEXT,
                end_time      TEXT,
                building_room TEXT,
                instructor    TEXT,
                
                FOREIGN KEY(section_id) REFERENCES sections(section_id) ON DELETE CASCADE
            )
            """
        )
        
        # Create an index on search-heavy fields to make the frontend lightning fast
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_course_dept ON courses(course_prefix, course_number);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_major ON courses(major_name);")
        
        conn.commit()


def insert_schedule_data(
    quarter: str, 
    year: int, 
    college: str, 
    major_name: str, 
    courses: list[dict], 
    db_path: str = "data/schedules.db"
):
    """Packages the hierarchical dict into relational SQL rows and inserts them safely."""
    init_schedule_db(db_path)
    
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()
        
        # 1. The "Delete and Replace" Strategy
        # Wipes old data for this specific major/quarter so we never get duplicates if we re-scrape.
        # Thanks to `ON DELETE CASCADE`, this automatically drops the sections and meetings too!
        cursor.execute(
            "DELETE FROM courses WHERE year = ? AND quarter = ? AND major_name = ?", 
            (year, quarter, major_name)
        )
        
        # 2. Iterate through the hierarchy and insert
        for c in courses:
            # Generate a unique string ID (e.g., "2024-AUT-AA-210")
            prefix_safe = str(c.get('course_prefix')).replace(" ", "")
            course_id = f"{year}-{quarter}-{prefix_safe}-{c.get('course_number')}"
            
            cursor.execute("""
                INSERT INTO courses 
                (
                    course_id, 
                    year, 
                    quarter,
                    college,
                    major_name,
                    course_prefix, 
                    course_number, 
                    course_title, 
                    has_prerequisites, 
                    notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) """, 
                (
                course_id, 
                year, 
                quarter, 
                college, 
                major_name, 
                c.get('course_prefix'),
                c.get('course_number'), 
                c.get('course_title'), 
                c.get('has_prerequisites'), 
                c.get('notes')
                )
            )
            
            for s in c.get('sections', []):
                # Generate a unique Section ID (e.g., "2024-AUT-AA-210-AA")
                section_id = f"{course_id}-{s.get('section_id')}"
                
                restr = s.get('restrictions', {})
                attrs = s.get('attributes', {})
                
                cursor.execute("""
                    INSERT INTO sections 
                    (
                        section_id, 
                        course_id, 
                        sln, 
                        section_type, 
                        credits_min, 
                        credits_max,
                        status, 
                        enrolled, 
                        enrollment_limit, 
                        is_limit_estimate, 
                        is_credit_no_credit,
                        fee, 
                        notes,
                        restricted_registration, 
                        add_code_required, 
                        independent_study,
                        asynchronous, 
                        hybrid, 
                        online, 
                        community_engaged, 
                        honors, 
                        jointly_offered,
                        research, 
                        service_learning, 
                        writing, 
                        new_course, 
                        no_financial_aid
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", 
                    (
                    section_id, 
                    course_id, 
                    s.get('SLN'), 
                    s.get('section_type'), 
                    s.get('credits_min'), 
                    s.get('credits_max'),
                    s.get('status'), 
                    s.get('enrolled'), 
                    s.get('enrollment_limit'), 
                    s.get('is_limit_estimate'), 
                    s.get('is_credit_no_credit'),
                    s.get('fee'), 
                    s.get('notes'),
                    restr.get('restricted_registration'), 
                    restr.get('add_code_required'), 
                    restr.get('independent_study'),
                    attrs.get('asynchronous'), 
                    attrs.get('hybrid'), 
                    attrs.get('online'), 
                    attrs.get('community_engaged'), 
                    attrs.get('honors'), 
                    attrs.get('jointly_offered'),
                    attrs.get('research'), 
                    attrs.get('service_learning'), 
                    attrs.get('writing'), 
                    attrs.get('new_course'), 
                    attrs.get('no_financial_aid')
                    )
                )
                
                for m in s.get('meetings', []):
                    time_data = m.get('time', {})
                    days_str = ",".join(time_data.get('days', [])) if time_data.get('days') else None
                    
                    cursor.execute("""
                        INSERT INTO meetings 
                        (
                            section_id, 
                            is_tba, days, 
                            start_time, 
                            end_time,
                            building_room, 
                            instructor
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)""", 
                        (
                        section_id, 
                        time_data.get('is_tba'), 
                        days_str, 
                        time_data.get('start_time'), 
                        time_data.get('end_time'),
                        m.get('building_room'), 
                        m.get('instructor')
                        )
                    )
        
        conn.commit()