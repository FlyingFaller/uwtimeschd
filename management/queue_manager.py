import os
import sqlite3
from management.utils import fetch_page
from parse.url_codes import parse_url_codes

QUARTERS = ["WIN", "SPR", "SUM", "AUT"]

def get_next_quarter(quarter: str, year: int) -> tuple[str, int]:
    """Helper function to increment to the next chronological quarter."""
    idx = QUARTERS.index(quarter.upper())
    if idx == 3: # AUT
        return "WIN", year + 1
    return QUARTERS[idx + 1], year

def init_db(db_path: str = "data/queue.db", wipe: bool = False):
    """Initializes the pure HTTP-driven SQLite database."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        
        if wipe:
            print("[QUEUE] Wiping existing queue database for a clean slate...")
            cursor.execute("DROP TABLE IF EXISTS root_log")
            cursor.execute("DROP TABLE IF EXISTS child_log")
        
        # Table 1: The Root Pages
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS root_log (
                quarter          TEXT,
                year             INTEGER,
                available_majors TEXT,
                http_status      INTEGER,
                PRIMARY          KEY (quarter, year)
            )
        """)
        
        # Table 2: The Child Pages (The actual tasks)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS child_log (
                quarter     TEXT,
                year        INTEGER,
                major       TEXT,
                http_status INTEGER,
                PRIMARY KEY (quarter, year, major)
            )
        """)
        conn.commit()

def discover_tasks(
    start                 : tuple[str, int]        = ("WIN", 2004),
    end                   : tuple[str, int] | None = None,
    target_majors         : list[str] | None       = None,
    invalidate            : bool                   = False,
    db_path               : str                    = "data/queue.db",
    base_url              : str                    = "https://www.washington.edu/students/timeschd/",
    fetch_delay           : float                  = 0.5,
    max_consecutive_errors: int                    = 3,
    retry_http_codes      : list[int] | None       = None # Retry anything
):
    """
    Crawls quarters to generate tasks based strictly on HTTP status codes.
    Uses -1 for Pending and 0 for Network Timeouts.
    """
    init_db(db_path, wipe=invalidate)
    
    curr_qtr, curr_year = start[0].upper(), start[1]
    consecutive_errors = 0
    
    def should_retry(code):
        if retry_http_codes is None:
            return code != 200
        return code in retry_http_codes
    
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        
        while True:
            if end is not None:
                end_qtr, end_year = end[0].upper(), end[1]
                if curr_year > end_year or (curr_year == end_year and QUARTERS.index(curr_qtr) > QUARTERS.index(end_qtr)):
                    break

            print(f"[{curr_qtr} {curr_year}] Checking root index...")
            
            cursor.execute("SELECT http_status, available_majors FROM root_log WHERE quarter=? AND year=?", (curr_qtr, curr_year))
            row = cursor.fetchone()
            
            available_majors = []
            http_status = -1
            
            # 1. Cache Check: Trust the cache if it's NOT a code we want to retry
            if row and not should_retry(row[0]):
                http_status = row[0]
                if http_status == 200:
                    majors_str = row[1]
                    available_majors = majors_str.split(',') if majors_str else []
                    consecutive_errors = 0
                    
            # 2. Cache Miss or Retry Triggered: Fetch from Network
            else:
                url = f"{base_url}{curr_qtr}{curr_year}/"
                status_code, html = fetch_page(url, delay=fetch_delay)
                
                # Fetch page guarantees an int (0 for timeouts/exceptions)
                http_status = status_code
                
                if http_status == 200 and html:
                    available_majors = parse_url_codes(html)
                    majors_str = ','.join(available_majors)
                    consecutive_errors = 0
                    
                    cursor.execute("""
                        INSERT OR REPLACE INTO root_log (quarter, year, available_majors, http_status)
                        VALUES (?, ?, ?, ?)
                    """, (curr_qtr, curr_year, majors_str, http_status))
                else:
                    consecutive_errors += 1
                    
                    cursor.execute("""
                        INSERT OR REPLACE INTO root_log (quarter, year, available_majors, http_status)
                        VALUES (?, ?, NULL, ?)
                    """, (curr_qtr, curr_year, http_status))
                    print(f"[{curr_qtr} {curr_year}] Network Error/Not Found (Status {http_status}).")
                    
                conn.commit()
            
            # 3. Anti-Runaway Protection
            if consecutive_errors >= max_consecutive_errors:
                print(f"\n[QUEUE] Hit {max_consecutive_errors} consecutive errors. Reached the edge of published data. Stopping probe.")
                break
            
            # 4. Queue Tasks (Only if the root page was actually a 200)
            if http_status == 200:
                majors_to_add = target_majors if target_majors is not None else available_majors
                valid_majors = [m for m in majors_to_add if m in available_majors]
                
                tasks_added = 0
                for m in valid_majors:
                    # Insert -1 to mark as PENDING
                    cursor.execute("""
                        INSERT OR IGNORE INTO child_log (quarter, year, major, http_status)
                        VALUES (?, ?, ?, -1)
                    """, (curr_qtr, curr_year, m))
                    if cursor.rowcount > 0:
                        tasks_added += 1
                
                conn.commit()
                if tasks_added > 0:
                    print(f"[{curr_qtr} {curr_year}] Added {tasks_added} new tasks to queue.")
                else:
                    print(f"[{curr_qtr} {curr_year}] Up to date.")
                
            curr_qtr, curr_year = get_next_quarter(curr_qtr, curr_year)


# --- Helper methods for the Scraper Worker to use later ---

def get_tasks(db_path         : str              = "data/queue.db", 
              limit           : int | None       = 50,
              retry_http_codes: list[int] | None = None):
    """Pulls tasks that are pending (-1) or matching the desired retry codes."""
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row 
        cursor = conn.cursor()
        
        if retry_http_codes is None:
            # None means retry EVERYTHING that isn't a success (200)
            query = "SELECT quarter, year, major FROM child_log WHERE http_status != 200"
            params = ()
        elif not retry_http_codes:
            # If the list is empty, ONLY pull pending tasks (-1)
            query = "SELECT quarter, year, major FROM child_log WHERE http_status = -1"
            params = ()
        else:
            # We pull pending tasks (-1) PLUS any explicitly requested retry codes
            placeholders = ','.join(['?'] * len(retry_http_codes))
            query = f"SELECT quarter, year, major FROM child_log WHERE http_status = -1 OR http_status IN ({placeholders})"
            params = tuple(retry_http_codes)
            
        if limit is not None:
            query += " LIMIT ?"
            params = params + (limit,)
            
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def mark_task_status(quarter: str, year: int, major: str, http_status: int, db_path: str = "data/queue.db"):
    """Worker calls this to update the exact HTTP status code returned by the fetcher."""
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE child_log 
            SET http_status = ? 
            WHERE quarter = ? AND year = ? AND major = ?
        """, (http_status, quarter, year, major))
        conn.commit()