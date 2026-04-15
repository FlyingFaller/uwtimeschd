import sqlite3
import logging
from management.utils import fetch_page
from management.queue_manager import init_queue_db, discover_tasks, get_tasks, mark_task_status
from management.database_manager import init_schedule_db, insert_schedule_data
from parse.schedule import parse_schedule, parse_major_college
from parse.normalize import normalize_schedule_data
from parse.verify import verify_schedule_data
from contextlib import closing

logger = logging.getLogger(__name__)

def run_worker_pipeline(
    queue_db_path : str                    = "data/queue.db",
    master_db_path: str                    = "data/schedules.db",
    start_term    : tuple[str, int]        = ("WIN", 2024),
    end_term      : tuple[str, int] | None = None,
    target_majors : list[str] | None       = None,
    invalidate    : bool                   = False,
    task_limit    : int | None             = None,
    fetch_delay   : float                  = 0.5,
    root_url      : str                    = "https://www.washington.edu/students/timeschd/",
    max_errors    : int                    = 3,
    retry_only    : list[int] | None       = None,
    retry_except  : list[int] | None       = None
) -> bool:
    """
    The main discovery and scraping loop. 
    Accepts explicit, strongly-typed arguments. Configuration mapping belongs to the caller.
    """

    updates_made = False # Tracks whether schedule database changes were actually made

    # Open both database connections at the highest level
    with closing(sqlite3.connect(queue_db_path)) as queue_conn, closing(sqlite3.connect(master_db_path)) as master_conn:

        logger.info(f"Initializing queue database.")
        init_queue_db(queue_conn, wipe=invalidate)
        
        logger.info(f"Generating tasks.")
        discover_tasks(
            conn          = queue_conn,
            start_term    = start_term,
            end_term      = end_term,
            target_majors = target_majors,
            root_url      = root_url,
            fetch_delay   = fetch_delay,
            max_errors    = max_errors,
            retry_only    = retry_only,
            retry_except  = retry_except
        )

        logger.info(f"Starting scraper worker.")
        tasks = get_tasks(
            conn         = queue_conn, 
            limit        = task_limit, 
            retry_only   = retry_only, 
            retry_except = retry_except
        )
        
        if not tasks:
            logger.info(f"No pending tasks found in the queue.")
            return False
        
        logger.info(f"Tasks generated. Initializing schedule database.")
        init_schedule_db(master_conn)
            
        for task in tasks:
            url = f"{root_url}{task['quarter']}{task['year']}/{task['major']}.html"
            logger.info(f"Worker scraping {url}.")
            
            status_code, html = fetch_page(url, delay=fetch_delay)
            major_code = task['major'].lower()

            if status_code == 200 and html:
                try:
                    # 1. Parse Metadata
                    meta = parse_major_college(html)
                    college = meta['college'] or "Unknown College"
                    major_name = meta['major'] or major_code.upper()
                    
                    # 2. Extract, Normalize, and VERIFY
                    raw_courses = parse_schedule(html)
                    clean_courses = normalize_schedule_data(raw_courses)
                    verified_courses = verify_schedule_data(clean_courses)
                    
                    # 3. Database Insertion (using the injected connection)
                    insert_schedule_data(
                        conn       = master_conn,
                        quarter    = task['quarter'],
                        year       = task['year'],
                        college    = college,
                        major_name = major_name,
                        major_code = major_code,
                        courses    = verified_courses
                    )
                    
                    # 4. Mark task as successful
                    mark_task_status(queue_conn, task['quarter'], task['year'], task['major'], status_code)
                    logger.info(f"Successfully parsed & saved {len(verified_courses)} courses for {major_name}.")

                    updates_made = True
                    
                except Exception as e:
                    # 0 indicates a total script failure during processing
                    mark_task_status(queue_conn, task['quarter'], task['year'], task['major'], 0)
                    logger.error(f"Failed during parsing/database insertion: {e}.")
                
            else:
                # Log the specific 404, 502, etc.
                mark_task_status(queue_conn, task['quarter'], task['year'], task['major'], status_code)
                logger.warning(f"Failed to fetch page with status code: {status_code}).")
                
    logger.info(f"Worker finished.")

    return updates_made