import sqlite3
import logging
from contextlib import closing
from management.utils import fetch_page
from management.queue_manager import init_queue_db, discover_tasks, get_tasks, mark_task_status
from management.database_manager import ScheduleDatabase, clear_database, clear_registry
from parse.schedule import parse_schedule, parse_major_college
from parse.normalize import normalize_schedule_data
from parse.verify import verify_schedule_data

logger = logging.getLogger(__name__)

def run_worker_pipeline(
    queue_db_path : str                    = "data/queue.db",
    dataset_dir   : str                    = "data/schedules_dataset",
    registry_path : str                    = "data/registry.json",
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
    
    with closing(sqlite3.connect(queue_db_path)) as queue_conn:

        logger.info(f"Initializing queue database.")
        init_queue_db(queue_conn, wipe=invalidate)
        
        if invalidate:
            logger.info("Invalidation requested. Wiping existing dataset.")
            clear_registry(registry_path)
            clear_database(dataset_dir)
        
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
            
        # ==========================================
        # PHASE 1: EXTRACT & TRANSFORM (Network Bound)
        # ==========================================
        staged_payloads = []
        
        for task in tasks:
            url = f"{root_url}{task['quarter']}{task['year']}/{task['major']}.html"
            logger.info(f"Worker scraping {url}.")
            
            status_code, html = fetch_page(url, delay=fetch_delay)
            major_code = task['major'].lower()

            if status_code == 200 and html:
                try:
                    meta = parse_major_college(html)
                    college = meta['college'] or "Unknown College"
                    major_name = meta['major'] or major_code.upper()
                    
                    raw_courses = parse_schedule(html)
                    clean_courses = normalize_schedule_data(raw_courses)
                    verified_courses = verify_schedule_data(clean_courses)
                    
                    # Store temporarily to prevent data loss if crash occurs before save
                    staged_payloads.append({
                        'task'       : task,
                        'raw_courses': verified_courses,
                        'quarter'    : task['quarter'],
                        'year'       : task['year'],
                        'major_code' : major_code,
                        'major_name' : major_name,
                        'college'    : college,
                        'status_code': status_code
                    })
                    logger.info(f"Staged {len(verified_courses)} courses for {major_name}.")
                    
                except Exception as e:
                    mark_task_status(queue_conn, task['quarter'], task['year'], task['major'], 0)
                    logger.error(f"Failed during parsing: {e}")
            else:
                mark_task_status(queue_conn, task['quarter'], task['year'], task['major'], status_code)
                logger.warning(f"Failed to fetch page with status code: {status_code}.")

        if not staged_payloads:
            logger.info("No successful scrapes to commit.")
            return False

        # ==========================================
        # PHASE 2: LOAD & INTEGRATE (Disk Bound)
        # ==========================================
        logger.info(f"Loading existing database state for batch merge.")
        db = ScheduleDatabase(dataset_dir, registry_path)
        db.load()
        
        # db.merge_payload encapsulates both courses and registry updates
        for p in staged_payloads:
            db.merge_payload(
                raw_courses = p['raw_courses'],
                quarter     = p['quarter'],
                year        = p['year'],
                major_code  = p['major_code'],
                major_name  = p['major_name'],
                college     = p['college']
            )
            
        logger.info("Saving updated database state to disk.")
        db.save()

        # ==========================================
        # PHASE 3: COMMIT TRANSACTION
        # ==========================================
        # Safely mark queue tasks as complete only after Parquet save succeeds
        for p in staged_payloads:
            t = p['task']
            mark_task_status(queue_conn, t['quarter'], t['year'], t['major'], p['status_code'])
            
        logger.info(f"Worker finished. Committed {len(staged_payloads)} tasks.")
        return True