import os
import sqlite3
from management.fetch import fetch_page
from parse.url_codes import parse_url_codes

QUARTERS = ["WIN", "SPR", "SUM", "AUT"]

def get_next_quarter(quarter: str, year: int) -> tuple[str, int]:
    """Helper function to increment to the next chronological quarter."""
    idx = QUARTERS.index(quarter.upper())
    if idx == 3: # AUT
        return "WIN", year + 1
    return QUARTERS[idx + 1], year

def init_db(db_path: str = "data/queue.db"):
    """Initializes the SQLite database with the dual-table schema."""
    # Ensure the target directory exists before connecting
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        
        # Table 1: The Root Pages
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS root_log (
                quarter          TEXT,
                year             INTEGER,
                available_majors TEXT,
                status           TEXT,
                PRIMARY          KEY (quarter, year)
            )
        """)
        
        # Table 2: The Child Pages (The actual tasks)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS child_log (
                quarter TEXT,
                year    INTEGER,
                major   TEXT,
                status  TEXT,
                PRIMARY KEY (quarter, year, major)
            )
        """)
        conn.commit()

def discover_tasks(
    start: tuple[str, int] = ("WIN", 2004),
    end: tuple[str, int] | None = None,
    target_majors: list[str] | None = None,
    invalidate: bool = False,
    db_path: str = "data/queue.db"
):
    """
    Crawls quarters to generate tasks. 
    If end is None, it probes forward until it hits a 404/401.
    """
    init_db(db_path)
    
    curr_qtr, curr_year = start[0].upper(), start[1]
    
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        
        while True:
            # 1. Break Condition: If we hit our explicit target end date
            if end is not None:
                end_qtr, end_year = end[0].upper(), end[1]
                if curr_year > end_year or (curr_year == end_year and QUARTERS.index(curr_qtr) > QUARTERS.index(end_qtr)):
                    break

            print(f"[{curr_qtr} {curr_year}] Checking root index...")
            
            # 2. Check if we already probed this quarter historically
            cursor.execute("SELECT status, available_majors FROM root_log WHERE quarter=? AND year=?", (curr_qtr, curr_year))
            row = cursor.fetchone()
            
            available_majors = []
            status = None
            
            # Use cached data if it exists and we aren't forcing an invalidation
            if row and not invalidate:
                status, majors_str = row
                if status == 'COMPLETED':
                    available_majors = majors_str.split(',') if majors_str else []
                elif status == 'HTTP_404' and end is None:
                    print(f"[{curr_qtr} {curr_year}] Found cached 404. Reached the end of known history. Stopping.")
                    break
            
            # 3. If no cached data (or invalidated), we must HTTP fetch the root page
            else:
                url = f"https://www.washington.edu/students/timeschd/{curr_qtr}{curr_year}/"
                status_code, html = fetch_page(url)
                
                if status_code == 200 and html:
                    available_majors = parse_url_codes(html)
                    majors_str = ','.join(available_majors)
                    status = 'COMPLETED'
                    
                    cursor.execute("""
                        INSERT OR REPLACE INTO root_log (quarter, year, available_majors, status)
                        VALUES (?, ?, ?, ?)
                    """, (curr_qtr, curr_year, majors_str, status))
                    conn.commit()
                    
                elif status_code in (404, 401):
                    status = 'HTTP_404'
                    cursor.execute("""
                        INSERT OR REPLACE INTO root_log (quarter, year, status)
                        VALUES (?, ?, ?)
                    """, (curr_qtr, curr_year, status))
                    conn.commit()
                    
                    # If probing indefinitely and hit a 404/401, we are done
                    if end is None:
                        print(f"[{curr_qtr} {curr_year}] 404/401 Not Found. End of available data reached. Stopping.")
                        break
                    else:
                        # Otherwise, keep looping towards the user's explicitly requested end date
                        curr_qtr, curr_year = get_next_quarter(curr_qtr, curr_year)
                        continue
                else:
                    # Catch-all for network timeouts or 500 server errors
                    print(f"[{curr_qtr} {curr_year}] Network Error ({status_code}). Skipping quarter.")
                    curr_qtr, curr_year = get_next_quarter(curr_qtr, curr_year)
                    continue
            
            # 4. We now have a list of available_majors. Generate tasks!
            if status == 'COMPLETED':
                majors_to_add = target_majors if target_majors is not None else available_majors
                
                # Safely filter: Only queue majors that actually exist in this specific quarter
                valid_majors = [m for m in majors_to_add if m in available_majors]
                
                tasks_added = 0
                for m in valid_majors:
                    if invalidate:
                        cursor.execute("""
                            INSERT OR REPLACE INTO child_log (quarter, year, major, status)
                            VALUES (?, ?, ?, 'PENDING')
                        """, (curr_qtr, curr_year, m))
                        tasks_added += 1
                    else:
                        # INSERT OR IGNORE skips rows that already exist (e.g. COMPLETED tasks)
                        cursor.execute("""
                            INSERT OR IGNORE INTO child_log (quarter, year, major, status)
                            VALUES (?, ?, ?, 'PENDING')
                        """, (curr_qtr, curr_year, m))
                        if cursor.rowcount > 0:
                            tasks_added += 1
                
                conn.commit()
                if tasks_added > 0:
                    print(f"[{curr_qtr} {curr_year}] Added {tasks_added} new tasks to queue.")
                else:
                    print(f"[{curr_qtr} {curr_year}] Up to date.")
                
            # Move to next chronological quarter
            curr_qtr, curr_year = get_next_quarter(curr_qtr, curr_year)


# --- Helper methods for the Scraper Worker to use later ---

def get_pending_tasks(db_path: str = "data/queue.db", limit: int = 50):
    """Pulls a batch of pending tasks for the worker to scrape."""
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row # Returns dict-like rows
        cursor = conn.cursor()
        if limit is None:
            cursor.execute("""
                SELECT quarter, year, major 
                FROM child_log 
                WHERE status = 'PENDING' 
            """)
        else:
            cursor.execute("""
                SELECT quarter, year, major 
                FROM child_log 
                WHERE status = 'PENDING' 
                LIMIT ?
            """, (limit,))
        return [dict(row) for row in cursor.fetchall()]

def mark_task_status(quarter: str, year: int, major: str, status: str, db_path: str = "data/queue.db"):
    """Worker calls this to update status (COMPLETED, ERROR) after scraping."""
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE child_log 
            SET status = ? 
            WHERE quarter = ? AND year = ? AND major = ?
        """, (status, quarter, year, major))
        conn.commit()