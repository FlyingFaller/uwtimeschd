import re
from bs4 import BeautifulSoup, NavigableString

def parse_major_college(html_content):
    """
    Extracts the major and college from the header tags at the top of the schedule page.
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    major, college = None, None
    
    # Target the first table on the page
    first_table = soup.find('table')
    if first_table:
        h2_tag = first_table.find('h2')
        if h2_tag:
            # stripped_strings naturally splits text separated by <br> tags
            strings = list(h2_tag.stripped_strings)
            
            if len(strings) > 0:
                major = strings[0]
            if len(strings) > 1:
                # Extract the college name from within the parentheses
                college_match = re.search(r'\(([^)]+)\)', strings[1])
                if college_match:
                    college = college_match.group(1).strip()
                    
    return {'major': major, 'college': college}

def parse_schedule(html_content, pad_left=1, pad_right=1):
    """
    Parses a UW Time Schedule HTML page using Dynamic Columnar Mapping.
    """
    raw_text_for_mapping = re.sub(r'<br\s*/?>', '\n', html_content, flags=re.IGNORECASE)
    raw_text_for_mapping = re.sub(r'</tr>', '\n</tr>', raw_text_for_mapping, flags=re.IGNORECASE)
    clean_text = BeautifulSoup(raw_text_for_mapping, 'html.parser').get_text()
    
    boundaries = get_column_boundaries(clean_text, pad_left, pad_right)
    
    soup = BeautifulSoup(html_content, 'html.parser')
    courses = []
    current_course = None
    tables = soup.find_all('table')
    
    for table in tables:
        if is_course_header(table):
            current_course = parse_course_header(table)
            current_course['notes'] = extract_notes(table)
            courses.append(current_course)
            
        elif is_section_table(table) and current_course is not None:
            sections = parse_section_table(table, boundaries)
            
            notes = extract_notes(table)
            if notes and sections:
                if sections[-1]['notes']:
                    sections[-1]['notes'] += ' ' + notes
                else:
                    sections[-1]['notes'] = notes
                    
            current_course['sections'].extend(sections)
            
    return courses

# --- Columnar Mapping Logic ---

def safe_find(line, *targets):
    """Returns the index of the first matching target string, or -1 if none found."""
    for t in targets:
        idx = line.find(t)
        if idx != -1:
            return idx
    return -1

def get_column_boundaries(clean_text, pad_left=1, pad_right=1):
    """Finds the table header and maps the character start/end indices for each column."""
    for line in clean_text.split('\n'):
        if 'Restr' in line and 'SLN' in line and 'Cred' in line:
            
            found_indices = [
                ('restr', 0),
                ('sln', max(0, line.find('SLN') - pad_left)),
                ('id', max(0, line.find('ID') - pad_left)),
                ('cred', max(0, line.find('Cred') - pad_left)),
                ('times', max(0, safe_find(line, 'Meeting Times', 'Times') - pad_left)),
                ('bldg_room', max(0, safe_find(line, 'Bldg Room', 'Bldg') - pad_left)),
                ('instructor', max(0, line.find('Instructor') - pad_left)),
                ('status', max(0, line.find('Status') - pad_left)),
                ('enrl', max(0, line.find('Enrl') - pad_left)),
                ('grades', max(0, line.find('Grades') - pad_left)),
                ('fee', max(0, line.find('Fee') - pad_left)),
                ('other', max(0, line.find('Other') - pad_left))
            ]
            
            valid_indices = [(name, idx) for name, idx in found_indices if idx > 0 or name == 'restr']
            valid_indices.sort(key=lambda x: x[1])
            
            boundaries = {}
            for i in range(len(valid_indices)):
                name, start_idx = valid_indices[i]
                end_idx = (valid_indices[i+1][1] + pad_right) if i + 1 < len(valid_indices) else None
                boundaries[name] = (start_idx, end_idx)
                
            for name, _ in found_indices:
                if name not in boundaries:
                    boundaries[name] = (0, 0)
                    
            return boundaries
            
    return {
        'restr': (0, 6), 'sln': (6, 11), 'id': (11, 15), 'cred': (15, 21),
        'times': (21, 40), 'bldg_room': (40, 52), 'instructor': (52, 75),
        'status': (75, 83), 'enrl': (83, 93), 'grades': (93, 100),
        'fee': (100, 106), 'other': (106, None)
    }

# --- Extraction Subroutines (Returning Primitives) ---

def extract_restrictions(chunk):
    match = re.search(r'^[^0-9]+', chunk)
    if match:
        res = match.group(0).strip()
        return res if res else None
    return None

def extract_sln(chunk):
    match = re.search(r'\d{4,5}', chunk)
    return match.group(0) if match else None

def extract_section_id(chunk):
    match = re.search(r'[A-Z0-9]{1,3}', chunk)
    return match.group(0) if match else None

def extract_credits(chunk):
    match = re.search(r'[\d\.\-/]+|VAR|[A-Z]{2}', chunk)
    return match.group(0) if match else None

def extract_times(chunk):
    cleaned = chunk.strip()
    if not cleaned:
        return None
    # Anchored to the start so it doesn't accidentally trigger on "TBA" hidden inside a text note
    match = re.search(r'^(to be arranged|TBA|[a-zA-Z]+\s+\d{1,4}[-:]\d{1,4})', cleaned)
    return match.group(0) if match else None

def extract_building_room(chunk):
    cleaned = chunk.strip()
    if not cleaned:
        return None
    
    if cleaned.startswith("TBA"):
        return "TBA"
        
    # Strictly requires the room portion to contain a digit or be an asterisk.
    # Prevents chunks of ALL CAPS text notes (like "D EVERY") from being misidentified as buildings!
    match = re.search(r'^([A-Z\*][A-Z0-9\*]{0,3})\s+([A-Z]*\d+[A-Z]*|\*)', cleaned)
    if match:
        return f"{match.group(1)} {match.group(2)}"
        
    return None

def extract_instructor(chunk):
    cleaned = chunk.strip()
    return cleaned if cleaned else None

def extract_status(chunk):
    match = re.search(r'[A-Za-z]{3,10}', chunk)
    return match.group(0) if match else None

def extract_enrollment(chunk):
    match = re.search(r'\d+\s*/\s*\d+[a-zA-Z]?', chunk)
    return match.group(0) if match else None

def extract_grades(chunk):
    match = re.search(r'[A-Z/]+', chunk)
    return match.group(0) if match else None

def extract_fee(chunk):
    match = re.search(r'\$\d+', chunk)
    return match.group(0) if match else None

def extract_other(chunk):
    cleaned = chunk.strip()
    if not cleaned:
        return None
        
    match = re.match(r'^[ABOEHJRSW%#\s]+', cleaned)
    if match:
        result = match.group(0).strip()
        return result if result else None
    return None

def extract_notes(table):
    notes = []
    curr = table.next_sibling
    while curr and curr.name not in ['table', 'div', 'p', 'script', 'hr']:
        text = str(curr).strip() if isinstance(curr, NavigableString) else (curr.get_text(strip=True) if curr.name != 'br' else "")
        text = text.replace('"', '').strip()
        if text and not text.startswith('<'):
            notes.append(text)
        curr = curr.next_sibling
    
    result = ' '.join(notes).strip()
    return result if result else None

def get_line_chunks(line, boundaries):
    """Slices a line into a dictionary of string chunks based on boundaries."""
    chunks = {}
    for col_name, (start, end) in boundaries.items():
        if end is None:
            chunks[col_name] = line[start:] if len(line) > start else ""
        else:
            chunks[col_name] = line[start:end] if len(line) > start else ""
    return chunks


# --- Parsing Subroutines (Building Structures) ---

def is_course_header(table):
    return table.find('a', attrs={'name': True}) is not None

def is_section_table(table):
    return table.find('pre') is not None

def parse_course_header(table):
    a_name = table.find('a', attrs={'name': True})
    dept_num_text = a_name.get_text(strip=True).replace('\xa0', ' ')
    
    m_dept = re.match(r'^(.+?)\s+(\d{3})$', dept_num_text)
    if m_dept:
        dept, num = m_dept.group(1).strip(), m_dept.group(2).strip()
    else:
        dept, num = dept_num_text, ""

    # Find the course title (e.g., from <a href="/students/crscat/aa.html#aa210">ENGR STATICS</a>)
    title_a = table.find('a', href=True)
    course_title = title_a.get_text(strip=True) if title_a else ""
        
    prereq_td = table.find('td', align='right')
    prereq_text = prereq_td.get_text(strip=True) if prereq_td else ""
    
    return {
        'department': dept,
        'course_number': num,
        'course_title': course_title if course_title else None,
        'prerequisites': prereq_text if prereq_text else None,
        'notes': None,
        'sections': []
    }

def parse_section_row(chunks):
    """Attempts to parse base section data from sliced chunks (requires an SLN)."""
    sln = extract_sln(chunks.get('sln', ''))
    if not sln:
        return None
    
    t = extract_times(chunks.get('times', ''))
    b = extract_building_room(chunks.get('bldg_room', ''))
    i = extract_instructor(chunks.get('instructor', ''))
    
    return {
        'restrictions': extract_restrictions(chunks.get('restr', '')),
        'SLN': sln,
        'section_id': extract_section_id(chunks.get('id', '')),
        'credits': extract_credits(chunks.get('cred', '')),
        'times': [t],
        'building_room': [b],
        'instructor': [i],
        'status': extract_status(chunks.get('status', '')),
        'enrollment_limit': extract_enrollment(chunks.get('enrl', '')),
        'grades': extract_grades(chunks.get('grades', '')),
        'fee': extract_fee(chunks.get('fee', '')),
        'other': extract_other(chunks.get('other', '')),
        'notes': None
    }

def parse_additional_times(chunks, current_section):
    """Attempts to append additional meeting times and locations to an existing section."""
    raw_t = chunks.get('times', '')
    raw_b = chunks.get('bldg_room', '')
    raw_i = chunks.get('instructor', '')
    
    t = extract_times(raw_t)
    bldg_str = extract_building_room(raw_b)
    i = extract_instructor(raw_i)
    
    # If a chunk contains text but fails its extraction regex, it is un-parseable text (i.e., a note).
    # We require all three chunks to either be completely empty or yield a successful extraction.
    t_is_valid = (not raw_t.strip()) or (t is not None)
    b_is_valid = (not raw_b.strip()) or (bldg_str is not None)
    i_is_valid = (not raw_i.strip()) or (i is not None)
    
    # If any of them failed their regex, this is a note masquerading as a meeting line.
    if not (t_is_valid and b_is_valid and i_is_valid):
        return False
        
    # Ensure we aren't just processing an entirely blank line
    if not raw_t.strip() and not raw_b.strip() and not raw_i.strip():
        return False
    
    # Unconditionally append all 3 lists to maintain exact length parity
    current_section['times'].append(t)
    current_section['building_room'].append(bldg_str)
    current_section['instructor'].append(i)
        
    return True

def parse_section_table(table, boundaries):
    """Processes a section table's HTML to build a list of section dictionaries."""
    raw_html = str(table)
    raw_html = re.sub(r'<br\s*/?>', '\n', raw_html, flags=re.IGNORECASE)
    raw_html = re.sub(r'</tr>', '\n</tr>', raw_html, flags=re.IGNORECASE)
    lines = BeautifulSoup(raw_html, 'html.parser').get_text().split('\n')
    
    sections = []
    current_section = None
    notes = []
    
    for raw_line in lines:
        line = raw_line.strip('\r\n')
        if not line.strip():
            continue
            
        chunks = get_line_chunks(line, boundaries)

        # 1. Primary Section Detection
        new_section = parse_section_row(chunks)
        if new_section:
            if current_section:
                notes_str = re.sub(r'\s{2,}', ' ', ' '.join(notes).strip())
                current_section['notes'] = notes_str if notes_str else None
                sections.append(current_section)
                notes = []
            current_section = new_section
            continue

        # 2. Secondary Meeting Time Detection
        if current_section and parse_additional_times(chunks, current_section):
            continue

        # 3. Note Line Detection
        cleaned_note = line.strip()
        if cleaned_note:
            notes.append(cleaned_note)
            
    if current_section:
        notes_str = re.sub(r'\s{2,}', ' ', ' '.join(notes).strip())
        current_section['notes'] = notes_str if notes_str else None
        sections.append(current_section)
        
    return sections
