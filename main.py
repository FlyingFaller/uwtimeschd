from management.fetch import fetch_page
from management.queue_manager import discover_tasks, get_pending_tasks, mark_task_status
from management.database_manager import insert_schedule_data
from management.chunk_db import chunk_database
from parse.schedule import parse_schedule, parse_major_college
from parse.normalize import normalize_schedule_data
import argparse

if __name__ == "__main__":
    
    print("--- 1. Generating Tasks ---")
    # Let's target a small, specific slice for our test
    discover_tasks(
        db_path="data/queue.db",
        # start=("AUT", 2021),
        # end=("AUT", 2021),
        target_majors=["aa", "meche", "cse", "appmath"], # Aeronautics and Mechanical Engineering
        invalidate=False
    )

    print("\n--- 2. Starting Scraper Worker ---")
    # Pull up to 5 tasks from the queue
    tasks = get_pending_tasks(db_path="data/queue.db", limit=None)
    
    if not tasks:
        print("No pending tasks found in the queue!")
        
    for task in tasks:
        url = f"https://www.washington.edu/students/timeschd/{task['quarter']}{task['year']}/{task['major']}.html"
        print(f"\n[WORKER] Scraping {url}...")
        
        status_code, html = fetch_page(url)
        
        if status_code == 200 and html:
            try:
                # 1. Parse Metadata (Major Name & College)
                meta = parse_major_college(html)
                college = meta['college'] or "Unknown College"
                major_name = meta['major'] or task['major'].upper()
                
                # 2. Parse Raw Schedule Data
                raw_courses = parse_schedule(html)
                
                # 3. Clean and Normalize Data
                clean_courses = normalize_schedule_data(raw_courses)
                
                # 4. Insert into the 3-Table Search Database
                insert_schedule_data(
                    quarter=task['quarter'],
                    year=task['year'],
                    college=college,
                    major_name=major_name,
                    courses=clean_courses,
                    db_path="data/schedules.db"
                )
                
                # 5. Mark Task Complete
                mark_task_status(task['quarter'], task['year'], task['major'], "COMPLETED", db_path="data/queue.db")
                print(f"[SUCCESS] Parsed & saved {len(clean_courses)} courses for {major_name} ({college}).")
                
            except Exception as e:
                # Catch any parsing or DB insertion errors so the script doesn't crash
                mark_task_status(task['quarter'], task['year'], task['major'], "ERROR", db_path="data/queue.db")
                print(f"[ERROR] Failed during parsing/database insertion: {e}")
            
        elif status_code in (401, 404):
            mark_task_status(task['quarter'], task['year'], task['major'], "HTTP_404", db_path="data/queue.db")
            print(f"[SKIP] Page not found or locked (Status {status_code}). Marked as HTTP_404.")
            
        else:
            mark_task_status(task['quarter'], task['year'], task['major'], "ERROR", db_path="data/queue.db")
            print(f"[RETRY] Network issue (Status {status_code}). Marked to retry later.")
            
    print("\n--- Worker Finished ---")

    print("\n--- Chunking Database ---")
    try:
        parser = argparse.ArgumentParser(description="Chunk a SQLite DB for sql.js-httpvfs")
        parser.add_argument("--db", type=str, default="data/schedules.db", help="Path to the SQLite database")
        parser.add_argument("--size", type=int, default=10, help="Chunk size in MB (default: 10)")
        
        args = parser.parse_args()
        chunk_database(args.db, args.size)
        print(f"[SUCCESS] Chunked database.")
    except Exception as e:
        print(f"[ERROR] Failed to chunk database: {e}")