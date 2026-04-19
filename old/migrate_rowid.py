import sqlite3
from management.utils import stitch_database

def remove_without_rowid(db_path: str):
    """
    Refactors the schema to remove WITHOUT ROWID from all tables,
    performing an in-place data swap and vacuuming for HTTP-VFS alignment.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print(f"Connecting to {db_path}...")

    # 1. Disable Foreign Keys before swapping tables with dependencies
    cursor.execute("PRAGMA foreign_keys = OFF;")
    
    try:
        # Begin the swap transaction
        cursor.execute("BEGIN TRANSACTION;")
        
        # ==========================================
        # 1. MAJORS TABLE
        # ==========================================
        print("Migrating 'majors' table...")
        cursor.execute("""
            CREATE TABLE majors_new (
                course_prefix TEXT PRIMARY KEY,
                major_name    TEXT,
                major_code    TEXT
            );
        """)
        cursor.execute("INSERT INTO majors_new SELECT * FROM majors;")
        cursor.execute("DROP TABLE majors;")
        cursor.execute("ALTER TABLE majors_new RENAME TO majors;")

        # ==========================================
        # 2. FILTER DISCOVERY TABLE (The Sieve)
        # ==========================================
        print("Migrating 'filter_discovery' table...")
        cursor.execute("""
            CREATE TABLE filter_discovery_new (
                course_prefix   TEXT,
                course_number   INTEGER,
                term_code       INTEGER,
                course_id       TEXT,
                section_id      TEXT,
                meeting_index   INTEGER, 
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
        """)
        cursor.execute("INSERT INTO filter_discovery_new SELECT * FROM filter_discovery;")
        cursor.execute("DROP TABLE filter_discovery;")
        cursor.execute("ALTER TABLE filter_discovery_new RENAME TO filter_discovery;")

        # ==========================================
        # 3. COURSES TABLE
        # ==========================================
        print("Migrating 'courses' table...")
        cursor.execute("""
            CREATE TABLE courses_new (
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
        """)
        cursor.execute("INSERT INTO courses_new SELECT * FROM courses;")
        cursor.execute("DROP TABLE courses;")
        cursor.execute("ALTER TABLE courses_new RENAME TO courses;")

        # ==========================================
        # 4. SECTIONS TABLE
        # ==========================================
        print("Migrating 'sections' table...")
        cursor.execute("""
            CREATE TABLE sections_new (
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
        """)
        cursor.execute("INSERT INTO sections_new SELECT * FROM sections;")
        cursor.execute("DROP TABLE sections;")
        cursor.execute("ALTER TABLE sections_new RENAME TO sections;")

        # ==========================================
        # 5. REBUILD INDEXES
        # ==========================================
        print("Rebuilding indexes...")
        # (Dropping the old tables automatically deleted these, so we just recreate them)
        cursor.execute("CREATE INDEX idx_discovery_time ON filter_discovery(term_code DESC, course_prefix ASC, course_number ASC, course_id);")
        cursor.execute("CREATE INDEX idx_discovery_major ON filter_discovery(course_prefix, term_code DESC, course_number ASC, course_id);")
        cursor.execute("CREATE INDEX idx_discovery_level ON filter_discovery(course_number, term_code DESC, course_prefix ASC, course_id);")
        cursor.execute("CREATE INDEX idx_discovery_fts_id ON filter_discovery(course_id, term_code DESC, course_prefix ASC, course_number ASC);")
        cursor.execute("CREATE INDEX idx_sections_cid ON sections(course_id);")
        
        # Note: meetings table didn't have WITHOUT ROWID, so it wasn't dropped. 
        # Its index (idx_meetings_sid) still exists, so no need to recreate it.

        # Commit the swaps
        conn.commit()
        print("Data swapped successfully.")

    except Exception as e:
        conn.rollback()
        print(f"Error during migration: {e}")
        return
    
    finally:
        # Always turn foreign keys back on, even if we failed
        cursor.execute("PRAGMA foreign_keys = ON;")

    # ==========================================
    # 6. VACUUM (Critical for HTTP-VFS)
    # ==========================================
    print("Vacuuming database to rebuild B-Trees and align chunks...")
    # Vacuum cannot be run inside a transaction, which is why it's down here.
    conn.execute("VACUUM;")
    
    conn.close()
    print("Migration complete! Your DB is ready for the serverless web.")

if __name__ == "__main__":
    # Replace with your actual database filename
    # stitch_database(output_path="data/schedules_old.db")
    stitch_database()
    DB_FILENAME = "data/schedules.db" 
    remove_without_rowid(DB_FILENAME)