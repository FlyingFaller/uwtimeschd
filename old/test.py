from management.utils import fetch_page
from management.queue_manager import discover_tasks, get_tasks, mark_task_status
from management.database_manager import insert_schedule_data
from parse.schedule import parse_schedule, parse_major_college
from parse.normalize import normalize_schedule_data, clean_time
from parse.debug import print_schedule, print_dict


URL = "https://www.washington.edu/students/timeschd/WIN2021/aa.html"
# URL = "https://www.washington.edu/students/timeschd/AUT2021/aa.html"
# URL = "https://www.washington.edu/students/timeschd/SUM2021/aa.html"
# URL = "https://www.washington.edu/students/timeschd/AUT2005/meche.html"
code, html = fetch_page(URL, delay=0.0)
courses = parse_schedule(html)
# print_schedule(courses)
aa595 = courses[22]
aa595_sec = aa595['sections'][0]
# print(aa595_sec['times'][0])
aa595_clean_time = clean_time(aa595_sec['times'][0])
# print_dict(aa595_clean_time)
# print_dict(courses)
clean_courses = normalize_schedule_data(courses)
# print_dict(clean_courses[22])
# print_dict(clean_courses)
for course in clean_courses:
    for section in course['sections']:
        for meeting in section['meetings']:
            start_time = meeting['time']['start_time'] 
            end_time = meeting['time']['end_time']
            if start_time or end_time:
                print(f'{start_time} - {end_time}')

# print_schedule(courses)