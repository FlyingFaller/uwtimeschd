import json
from parse.schedule import CourseDict

def print_schedule(courses: list[CourseDict]):
    """Prints the parsed schedule data in a readable, original-like format."""
    for course in courses:
        # Include the newly extracted course title here
        title_str = f" - {course['course_title']}"
        print(f"\n{course['course_prefix']} {course['course_number']}{title_str} {course['gen_ed_reqs']} {course['prerequisites']}")
        
        if course['notes']: print(f"  Course Notes: {course['notes']}")
        print("  " + "-" * 115)
        print(f"  {'Restr':<6} {'SLN':<5} {'ID':<3} {'Cred':<4} {'Times':<20} {'Bldg Room':<10} {'Instructor':<18} {'Status':<6} {'Enrl':<8} {'Grades':<6} {'Fee':<4} {'Other'}")
        
        for sec in course['sections']: 
            # Format lists for output printing
            t_list  = sec['times']
            br_list = sec['building_room']
            i_list  = sec['instructor']
            
            num_rows = max(len(t_list), 1)
            
            for row_idx in range(num_rows):
                t = t_list[row_idx][:20] if row_idx < len(t_list) else ""
                br = br_list[row_idx][:10] if row_idx < len(br_list) else ""
                i = i_list[row_idx][:18] if row_idx < len(i_list) else ""
                
                if row_idx == 0:
                    # Print the primary section row
                    print(f"  {sec['restrictions']:<6} {sec['SLN']:<5} {sec['section_id']:<3} {sec['credits']:<4} {t:<20} {br:<10} {i:<18} {sec['status']:<6} {sec['enrollment_limit']:<8} {sec['grades']:<6} {sec['fee']:<4} {sec['other']}")
                else:
                    # Print the secondary meeting rows, aligned perfectly using a 22-space prefix
                    empty_prefix = " " * 22
                    print(f"  {empty_prefix}{t:<20} {br:<10} {i:<18}")

            if sec['notes']: print(f"         Notes: {sec['notes']}")

def print_dict(dict_obj) -> None:
    """Pretty prints the nested dictionary structure using JSON formatting."""
    print(json.dumps(dict_obj, indent=2))
