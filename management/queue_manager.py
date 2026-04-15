import sqlite3
import logging
from typing import TypedDict
from management.utils import fetch_page
from parse.url_codes import parse_url_codes

logger = logging.getLogger(__name__)

QUARTERS = ["WIN", "SPR", "SUM", "AUT"]

# --- Type Definitions ---

class TaskDict(TypedDict):
    quarter: str
    year: int
    major: str

# --- Database Initialization ---

def init_queue_db(conn: sqlite3.Connection, wipe: bool = False):
    """Initializes the pure HTTP-driven SQLite database."""
    cursor = conn.cursor()
    
    if wipe:
        logger.warning(f"Wiping existing queue database.")
        cursor.execute("DROP TABLE IF EXISTS root_log")
        cursor.execute("DROP TABLE IF EXISTS child_log")
    
    # We maintain 'http_status' strictly as the database column name, 
    # but use 'status_code' everywhere in Python.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS root_log (
            quarter          TEXT,
            year             INTEGER,
            available_majors TEXT,
            http_status      INTEGER,
            PRIMARY KEY (quarter, year)
        ) WITHOUT ROWID;
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS child_log (
            quarter     TEXT,
            year        INTEGER,
            major       TEXT,
            http_status INTEGER,
            PRIMARY KEY (quarter, year, major)
        ) WITHOUT ROWID;
    """)
    conn.commit() 


# --- Discovery Phase ---

def get_next_quarter(quarter: str, year: int) -> tuple[str, int]:
    """Helper function to increment to the next chronological quarter."""
    idx = QUARTERS.index(quarter.upper())
    if idx == 3: # AUT
        return "WIN", year + 1
    return QUARTERS[idx + 1], year

def discover_tasks(
    conn         : sqlite3.Connection,
    start_term   : tuple[str, int]        = ("WIN", 2004),
    end_term     : tuple[str, int] | None = None,
    target_majors: list[str] | None       = None,
    root_url     : str                    = "https://www.washington.edu/students/timeschd/",
    fetch_delay  : float                  = 0.5,
    max_errors   : int                    = 3,
    retry_only   : list[int] | None       = None,
    retry_except : list[int] | None       = None
):
    """
    Crawls quarters to generate tasks based strictly on HTTP status codes.
    Uses -1 for Pending and 0 for Network Timeouts.
    """
    if retry_only is not None and retry_except is not None:
        raise ValueError("Cannot use both 'retry_only' and 'retry_except' simultaneously.")

    curr_qtr, curr_year = start_term[0].upper(), start_term[1]
    consecutive_errors = 0
    
    cursor = conn.cursor()
    
    while True:
        if end_term is not None:
            end_qtr, end_year = end_term[0].upper(), end_term[1]
            if curr_year > end_year or (curr_year == end_year and QUARTERS.index(curr_qtr) > QUARTERS.index(end_qtr)):
                break
        
        logger.info(f"Checking root index at term {curr_qtr} {curr_year}.")
        
        cursor.execute("SELECT http_status, available_majors FROM root_log WHERE quarter=? AND year=?", (curr_qtr, curr_year))
        row = cursor.fetchone()
        
        available_majors: list[str] = []
        status_code: int = -1
        needs_retry: bool = False
        
        # 1. Evaluate Cache vs. Retry Rules
        if row is None:
            needs_retry = True
        else:
            cached_code = row[0]
            if cached_code == 200:
                needs_retry = False
            elif retry_only is not None:
                needs_retry = cached_code in retry_only
            elif retry_except is not None:
                needs_retry = cached_code not in retry_except
            else:
                needs_retry = True # Default: Retry everything that isn't a 200
        
        # 2. Process based on evaluation
        if not needs_retry and row is not None:
            status_code = row[0]
            if status_code == 200:
                majors_str: str = row[1]
                available_majors = majors_str.split(',') if majors_str else []
                consecutive_errors = 0
                
        else:
            url = f"{root_url}{curr_qtr}{curr_year}/"
            status_code, html = fetch_page(url, delay=fetch_delay)
            
            if status_code == 200 and html:
                available_majors = parse_url_codes(html)
                majors_str = ','.join(available_majors)
                consecutive_errors = 0
                
                cursor.execute("""
                    INSERT OR REPLACE INTO root_log (quarter, year, available_majors, http_status)
                    VALUES (?, ?, ?, ?)
                """, (curr_qtr, curr_year, majors_str, status_code))
            else:
                consecutive_errors += 1
                
                cursor.execute("""
                    INSERT OR REPLACE INTO root_log (quarter, year, available_majors, http_status)
                    VALUES (?, ?, NULL, ?)
                """, (curr_qtr, curr_year, status_code))
                logger.warning(f"Failed to fetch term {curr_qtr} {curr_year} page with status code: {status_code}).")
                
        conn.commit() 
        
        # 3. Anti-Runaway Protection
        if consecutive_errors >= max_errors:
            logger.warning(f"Hit {max_errors} consecutive errors. Stopping discovery.")
            break
        
        # 4. Queue Tasks (Only if the root page is a 200)
        if status_code == 200:
            majors_to_add = target_majors if target_majors is not None else available_majors
            valid_majors = list(set(majors_to_add) & set(available_majors))
            
            tasks_added = 0
            for m in valid_majors:
                cursor.execute("""
                    INSERT OR IGNORE INTO child_log (quarter, year, major, http_status)
                    VALUES (?, ?, ?, -1)
                """, (curr_qtr, curr_year, m))
                if cursor.rowcount > 0:
                    tasks_added += 1
            
            conn.commit()
            
            if tasks_added > 0:
                logging.info(f"Added {tasks_added} new tasks to queue for term {curr_qtr} {curr_year}.")
            else:
                logging.info(f"Term {curr_qtr} {curr_year}] is up to date.")
            
        curr_qtr, curr_year = get_next_quarter(curr_qtr, curr_year)


# --- Scraper Worker Helper Methods ---

def get_tasks(
    conn        : sqlite3.Connection, 
    limit       : int | None       = 50,
    retry_only  : list[int] | None = None,
    retry_except: list[int] | None = None
) -> list[TaskDict]:
    """Pulls tasks matching the retry logic constraints. -1 (Pending) is always included unless explicitly filtered."""
    
    if retry_only is not None and retry_except is not None:
        raise ValueError("Cannot use both 'retry_only' and 'retry_except' simultaneously.")
    
    params: list[int] = []
    
    # Build query safely avoiding 200s and handling the whitelist/blacklist
    if retry_only is not None:
        placeholders = ','.join(['?'] * len(retry_only))
        query = f"SELECT quarter, year, major FROM child_log WHERE http_status = -1 OR http_status IN ({placeholders})"
        params.extend(retry_only)
        
    elif retry_except is not None:
        placeholders = ','.join(['?'] * len(retry_except))
        # Ensure we still skip 200s even if they aren't explicitly in the except list
        query = f"SELECT quarter, year, major FROM child_log WHERE http_status = -1 OR (http_status != 200 AND http_status NOT IN ({placeholders}))"
        params.extend(retry_except)
        
    else:
        # Default: Pull everything that isn't marked as success (200)
        query = "SELECT quarter, year, major FROM child_log WHERE http_status != 200"
        
    if limit is not None:
        query += " LIMIT ?"
        params.append(limit)
        
    cursor = conn.cursor()
    cursor.execute(query, params)
    
    return [{
        'quarter': row[0],
        'year'   : row[1],
        'major'  : row[2]
    } for row in cursor.fetchall()]

def mark_task_status(
    conn       : sqlite3.Connection, 
    quarter    : str, 
    year       : int, 
    major      : str, 
    status_code: int
):
    """Worker calls this to update the exact HTTP status code returned by the fetcher."""
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE child_log 
        SET http_status = ? 
        WHERE quarter = ? AND year = ? AND major = ?
    """, (status_code, quarter, year, major))
    
    conn.commit()