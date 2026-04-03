from parse.fetch import fetch_page
from parse.url_codes import parse_url_codes
from parse.schedule import parse_schedule, print_schedule, parse_major_college


# Test the functions
if __name__ == "__main__":
    target_url = "https://www.washington.edu/students/timeschd/AUT2021/aa.html"
    # target_url = "https://www.washington.edu/students/timeschd/SUM2016/aa.html"
    # target_url = "https://www.washington.edu/students/timeschd/WIN2004/aa.html"
    
    print(f"Fetching {target_url}...")
    html = fetch_page(target_url)
    
    if html:
        # url_codes = parse_url_codes(html)
        # print(url_codes)
        courses = parse_schedule(html)
        print(courses[0])
        # print_schedule(courses)
        # print(parse_major_college(html))