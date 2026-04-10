from management.fetch import fetch_page
from management.queue_manager import discover_tasks, get_pending_tasks, mark_task_status
from management.database_manager import insert_schedule_data
from parse.schedule import parse_schedule, parse_major_college
from parse.normalize import normalize_schedule_data
from parse.debug import print_schedule, print_dict

# URL = "https://www.washington.edu/students/timeschd/WIN2021/aa.html"
URL = "https://www.washington.edu/students/timeschd/AUT2021/aa.html"
# URL = "https://www.washington.edu/students/timeschd/SUM2021/aa.html"
# URL = "https://www.washington.edu/students/timeschd/AUT2005/meche.html"
code, html = fetch_page(URL)
courses = parse_schedule(html)
# print_schedule(courses)
# print_dict(courses[0])
clean_courses = normalize_schedule_data(courses)
print_dict(clean_courses[9])
# print_schedule(courses)