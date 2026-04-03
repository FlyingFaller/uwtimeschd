from parse.fetch import fetch_page
from parse.url_codes import parse_url_codes
from parse.schedule import parse_schedule, print_schedule, parse_major_college
from scrape.queue_manager import discover_tasks, get_pending_tasks, mark_task_status

if __name__ == "__main__":
    
    # ---------------------------------------------------------
    # Optional: Test just the new fetch function
    # ---------------------------------------------------------
    # target_url = "https://www.washington.edu/students/timeschd/AUT2020/me.html"
    # status_code, html = fetch_page(target_url)
    # print(f"Fetch Result -> Status: {status_code}, HTML Length: {len(html) if html else 0}")
    # exit()
    
    # ---------------------------------------------------------
    # 1. Testing the Task Generator
    # ---------------------------------------------------------
    # print("--- 1. Testing the Task Generator ---")
    # discover_tasks(
    #     db_path="scrape/queue.db",
    #     start=("AUT", 2021),
    #     end=None,
    #     target_majors=None,
    #     invalidate=False
    # )

    # # ---------------------------------------------------------
    # # 2. Testing the Scraper Worker
    # # ---------------------------------------------------------
    # print("\n--- 2. Testing the Scraper Worker ---")
    # tasks = get_pending_tasks(limit=3)
    
    # if not tasks:
    #     print("No pending tasks found!")
        
    # for task in tasks:
    #     url = f"https://www.washington.edu/students/timeschd/{task['quarter']}{task['year']}/{task['major']}.html"
    #     print(f"\nWorker is scraping {url}...")
        
    #     status_code, html = fetch_page(url)
        
    #     if status_code == 200 and html:
    #         courses = parse_schedule(html)
    #         print(f"Successfully parsed {len(courses)} courses.")
            
    #         # Here is where you would INSERT into your `uw_schedules.db` search database!
            
    #         mark_task_status(task['year'], task['quarter'], task['major'], "COMPLETED")
    #         print(f"Marked task {task['major']} {task['quarter']} {task['year']} as COMPLETED.")
            
    #     elif status_code == 404:
    #         # Maybe the major was listed on the root page but the child page 404s (UW makes mistakes)
    #         mark_task_status(task['year'], task['quarter'], task['major'], "HTTP_404")
    #         print(f"Child page not found! Marked as HTTP_404.")
            
    #     else:
    #         mark_task_status(task['year'], task['quarter'], task['major'], "ERROR")
    #         print(f"Failed to fetch (Status: {status_code}). Marked as ERROR to retry later.")

    page = "https://www.washington.edu/students/timeschd/AUT2021/aa.html"
    code, html = fetch_page(page)
    courses = parse_schedule(html)
    print_schedule(courses)
    print(courses[0:2])