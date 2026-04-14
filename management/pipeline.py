from management.utils import fetch_page
from management.queue_manager import discover_tasks, get_tasks, mark_task_status
from management.database_manager import insert_schedule_data
from parse.schedule import parse_schedule, parse_major_college
from parse.normalize import normalize_schedule_data

# Sentinel object to distinguish between "not passed" and "explicitly passed as None"
MISSING = object()

def _resolve_pipeline_args(
    config, queue_db_path, master_db_path, start, end, 
    target_majors, invalidate, task_limit, fetch_delay, base_url, 
    max_consecutive_errors, retry_http_codes
):
    """Helper function to resolve arguments in the order of Explicit -> Config -> Default."""
    cfg      = config or {}
    paths    = cfg.get('paths', {})
    targets  = cfg.get('targets', {})
    scraping = cfg.get('scraping', {})
    
    def resolve(explicit, config_val, default):
        if explicit is not MISSING:
            return explicit
        if config_val is not None:
            return config_val
        return default

    return {
        "queue_db"              : resolve(queue_db_path, paths.get('queue_db'), "data/queue.db"),
        "master_db"             : resolve(master_db_path, paths.get('master_db'), "data/schedules.db"),
        "start"                 : resolve(start, targets.get('start'), ("WIN", 2024)),
        "end"                   : resolve(end, targets.get('end'), ("AUT", 2024)),
        "target_majors"         : resolve(target_majors, targets.get('target_majors'), None),
        "invalidate"            : resolve(invalidate, scraping.get('invalidate'), False),
        "task_limit"            : resolve(task_limit, scraping.get('task_limit'), None),
        "fetch_delay"           : resolve(fetch_delay, scraping.get('fetch_delay'), 0.25),
        "base_url"              : resolve(base_url, scraping.get('base_url'), "https://www.washington.edu/students/timeschd/"),
        "max_consecutive_errors": resolve(max_consecutive_errors, scraping.get('max_consecutive_errors'), 3),
        "retry_http_codes"      : resolve(retry_http_codes, scraping.get('retry_http_codes'), None)
    }

def run_worker_pipeline(
    config                 = None,
    queue_db_path          = MISSING,
    master_db_path         = MISSING,
    start                  = MISSING,
    end                    = MISSING,
    target_majors          = MISSING,
    invalidate             = MISSING,
    task_limit             = MISSING,
    fetch_delay            = MISSING,
    base_url               = MISSING,
    max_consecutive_errors = MISSING,
    retry_http_codes       = MISSING
):
    """
    The main discovery and scraping loop. 
    Accepts explicit arguments for manual runs, falling back to a config dictionary if provided.
    """
    # Resolve all parameters cleanly
    opts = _resolve_pipeline_args(
        config, queue_db_path, master_db_path, start, end, 
        target_majors, invalidate, task_limit, fetch_delay, base_url,
        max_consecutive_errors, retry_http_codes
    )

    print("\n--- 1. Generating Tasks ---")
    discover_tasks(
        start                  = opts["start"],
        end                    = opts["end"],
        target_majors          = opts["target_majors"],
        invalidate             = opts["invalidate"],
        db_path                = opts["queue_db"],
        base_url               = opts["base_url"],
        fetch_delay            = opts["fetch_delay"],
        max_consecutive_errors = opts["max_consecutive_errors"],
        retry_http_codes       = opts["retry_http_codes"]

    )

    print("\n--- 2. Starting Scraper Worker ---")
    tasks = get_tasks(db_path=opts["queue_db"], limit=opts["task_limit"], retry_http_codes=opts['retry_http_codes'])
    
    if not tasks:
        print("No pending tasks found in the queue!")
        return
        
    for task in tasks:
        # Base URL is correctly appended using the resolved configuration
        url = f"{opts['base_url']}{task['quarter']}{task['year']}/{task['major']}.html"
        print(f"\n[WORKER] Scraping {url}...")
        
        status_code, html = fetch_page(url, delay=opts["fetch_delay"])
        major_code= task['major'].lower()

        if status_code == 200 and html:
            try:
                meta = parse_major_college(html)
                college = meta['college'] or "Unknown College"
                major_name = meta['major'] or major_code.upper()
                
                raw_courses = parse_schedule(html)
                clean_courses = normalize_schedule_data(raw_courses)
                
                # Because the DB is either missing (bootstrap) or stitched (update), 
                # this insert will just work flawlessly.
                insert_schedule_data(
                    quarter    = task['quarter'],
                    year       = task['year'],
                    college    = college,
                    major_name = major_name,
                    major_code = major_code,
                    courses    = clean_courses,
                    db_path    = opts["master_db"]
                )
                
                mark_task_status(task['quarter'], task['year'], task['major'], status_code, db_path=opts["queue_db"])
                print(f"[SUCCESS] Parsed & saved {len(clean_courses)} courses for {major_name}.")
                
            except Exception as e:
                mark_task_status(task['quarter'], task['year'], task['major'], 0, db_path=opts["queue_db"])
                print(f"[ERROR] Failed during parsing/database insertion: {e}")
            
        else:
            mark_task_status(task['quarter'], task['year'], task['major'], status_code, db_path=opts["queue_db"])
            print(f"[RETRY] Network issue (Status {status_code}).")
            
    print("\n--- Worker Finished ---")