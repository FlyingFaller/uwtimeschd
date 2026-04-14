import re
from bs4 import BeautifulSoup
from bs4.element import Tag, PageElement, ResultSet
from typing import TypedDict

class SectionDict(TypedDict):
    restrictions    : str
    SLN             : str
    section_id      : str
    credits         : str
    times           : list[str]
    building_room   : list[str]
    instructor      : list[str]
    status          : str
    enrollment_limit: str
    grades          : str
    fee             : str
    other           : str
    notes           : str | None

class CourseDict(TypedDict):
    course_prefix: str
    course_number: str
    course_title : str
    gen_ed_reqs  : str
    prerequisites: str
    notes        : str | None
    sections     : list[SectionDict]

def parse_major_college(html_content: str) -> dict[str, str|None]:
    """
    Extracts the major and college from the header tags at the top of the schedule page.
    """
    soup = BeautifulSoup(html_content, 'html.parser')

    first_table: Tag = soup.find('table')
    if not first_table:
        return {'major': None, 'college': None}
        
    h2_tag: Tag = first_table.find('h2')
    if not h2_tag:
        return {'major': None, 'college': None}
            
    strings = list(h2_tag.stripped_strings)
    
    major = strings[0] if len(strings) > 0 else None
    college = None
    
    if len(strings) > 1:
        college_match = re.search(r'\(([^)]+)\)', strings[1])
        if college_match:
            college = college_match.group(1).strip()
                    
    return {'major': major, 'college': college}

def parse_schedule(html_content: str, pad_left: int = 1, pad_right: int = 1) -> list[CourseDict]:
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
    tables: ResultSet = soup.find_all('table')
    
    for table in tables:
        if is_course_header(table):
            current_course = parse_course_header(table)
            current_course['notes'] = extract_notes(table)
            courses.append(current_course)
            
        elif is_section_table(table) and current_course is not None:
            sections = parse_section_table(table, boundaries)
            
            notes = extract_notes(table)
            if notes and sections:
                prev_notes = sections[-1].get('notes')
                sections[-1]['notes'] = f"{prev_notes} {notes}" if prev_notes else notes
                    
            current_course['sections'].extend(sections)
            
    return courses

# --- Columnar Mapping Logic ---

def safe_find(line: str, *targets: str) -> int:
    """Returns the index of the first matching target string, or -1 if none found."""
    for t in targets:
        idx = line.find(t)
        if idx != -1:
            return idx
    return -1

def get_column_boundaries(clean_text: str, pad_left=1, pad_right=1) -> dict[str, tuple[int, int|None]]:
    """Finds the table header and maps the character start/end indices for each column."""
    for line in clean_text.split('\n'):
        if 'Restr' in line and 'SLN' in line and 'Cred' in line:
            
            found_indices = [
                ('restr',      0),
                ('sln',        max(0, line.find('SLN') - pad_left)),
                ('id',         max(0, line.find('ID') - pad_left)),
                ('cred',       max(0, line.find('Cred') - pad_left)),
                ('times',      max(0, safe_find(line, 'Meeting Times', 'Times') - pad_left)),
                ('bldg_room',  max(0, safe_find(line, 'Bldg Room', 'Bldg') - pad_left)),
                ('instructor', max(0, line.find('Instructor') - pad_left)),
                ('status',     max(0, line.find('Status') - pad_left)),
                ('enrl',       max(0, line.find('Enrl') - pad_left)),
                ('grades',     max(0, line.find('Grades') - pad_left)),
                ('fee',        max(0, line.find('Fee') - pad_left)),
                ('other',      max(0, line.find('Other') - pad_left))
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
        'restr' : (0, 6),     'sln'      : (6, 11),  'id'        : (11, 15),  'cred': (15, 21),
        'times' : (21, 40),   'bldg_room': (40, 52), 'instructor': (52, 75),
        'status': (75, 83),   'enrl'     : (83, 93), 'grades'    : (93, 100),
        'fee'   : (100, 106), 'other'    : (106, None)
    }

# --- Extraction Subroutines (Returning Primitives) ---

def extract_restrictions(chunk: str) -> str:
    match = re.search(r'^([^0-9]+)', chunk)
    if match:
        return match.group(1).strip()
    return ""

def extract_sln(chunk: str) -> str:
    # Relaxed regex: The '>' character (Add Code Required) is often glued to the SLN. 
    # By removing the strict whitespace boundaries, we guarantee the 4-5 digit SLN is extracted.
    match = re.search(r'(\d{4,5})', chunk)
    return match.group(1) if match else ""

def extract_section_id(chunk: str) -> str:
    # Enforces that the 1-3 character ID is its own distinct "word" in the chunk
    match = re.search(r'(?:^|\s+)([A-Z0-9]{1,3})(?:\s+|$)', chunk)
    return match.group(1) if match else ""

def extract_credits(chunk: str) -> str:
    match = re.search(r'(?:^|\s+)([\d\.\-/]+|VAR|[A-Z]{2})(?:\s+|$)', chunk)
    return match.group(1) if match else ""

def extract_times(chunk: str) -> str:
    # The Gap Anchor replaces the strict `^` anchor
    match = re.search(r'(?:^|\s+)(to be arranged|TBA|[a-zA-Z]+\s+\d{1,4}[-:]\d{1,4})', chunk)
    return match.group(1) if match else ""

def extract_building_room(chunk: str) -> str:
    if "TBA" in chunk:
        return "TBA"
        
    # Group 1 captures the Building, Group 2 captures the Room. 
    # Protected from bleed-over by the leading gap anchor.
    match = re.search(r'(?:^|\s+)([A-Z\*][A-Z0-9\*]{0,3})\s+([A-Z]*\d+[A-Z]*|\*)', chunk)
    if match:
        return f"{match.group(1)} {match.group(2)}"
        
    return ""

def extract_instructor(chunk: str) -> str:
    # Instructors naturally contain spaces and commas. 
    # Best to strip stray digits (from building/room bleed) from the left edge.
    cleaned = re.sub(r'^[\d\s\*]+', '', chunk).strip()
    return cleaned or ""

def extract_status(chunk: str) -> str:
    match = re.search(r'(?:^|\s+)([A-Za-z]{3,10})(?:\s+|$)', chunk)
    return match.group(1) if match else ""

def extract_enrollment(chunk: str) -> str:
    match = re.search(r'(?:^|\s+)(\d+\s*/\s*\d+[a-zA-Z]?)(?:\s+|$)', chunk)
    return match.group(1) if match else ""

def extract_grades(chunk: str) -> str:
    match = re.search(r'(?:^|\s+)([A-Z/]+)(?:\s+|$)', chunk)
    return match.group(1) if match else ""

def extract_fee(chunk: str) -> str:
    match = re.search(r'(?:^|\s+)(\$\d+)(?:\s+|$)', chunk)
    return match.group(1) if match else ""

def extract_other(chunk: str) -> str:
    # The Gap Anchor ensures it skips over the trailing digits from the Fee column
    # Notice we capture group 1, omitting the need to match `\s` inside the character class
    match = re.search(r'(?:^|\s+)([ABOEHJRSW%#]+)(?:\s+|$)', chunk)
    return match.group(1) if match else ""

def extract_notes(table: Tag) -> str|None:
    notes = []
    curr: PageElement = table.next_sibling
    
    while curr:
        # 1. Type Narrowing Guard:
        # If 'curr' is an HTML Tag, check if it's one of our boundary tags.
        if isinstance(curr, Tag):
            if curr.name in ['table', 'div', 'p', 'script', 'hr']:
                break # Stop gathering notes
                
            # Handle specific <br> tags
            text = "" if curr.name == 'br' else curr.get_text(strip=True)
            
        # 2. If it's NOT a Tag, it must be a NavigableString (raw text)
        else:
            text = str(curr).strip()
            
        # 3. Clean and append
        text = text.replace('"', '').strip()
        if text and not text.startswith('<'):
            notes.append(text)
            
        # Move to the next sibling
        curr = curr.next_sibling
    
    result = ' '.join(notes).strip()
    return result or None

def get_line_chunks(line: str, boundaries: dict[str, tuple[int, int|None]]) -> dict[str, str]:
    """Slices a line into a dictionary of string chunks based on boundaries."""
    chunks = {}
    for col_name, (start, end) in boundaries.items():
        if end is None:
            # chunks[col_name] = line[start:] if len(line) > start else ""
            chunks[col_name] = line[start:]
        else:
            # chunks[col_name] = line[start:end] if len(line) > start else ""
            chunks[col_name] = line[start:end]
    return chunks


# --- Parsing Subroutines (Building Structures) ---

def is_course_header(table: Tag) -> bool:
    return table.find('a', attrs={'name': True}) is not None

def is_section_table(table: Tag) -> bool:
    return table.find('pre') is not None

def parse_course_header(table: Tag) -> CourseDict:
    a_name: Tag = table.find('a', attrs={'name': True})
    prefix_num_text = a_name.get_text(strip=True).replace('\xa0', ' ')
    
    m_prefix = re.match(r'^(.+?)\s+(\d{3})$', prefix_num_text)
    if m_prefix:
        prefix, num = m_prefix.group(1).strip(), m_prefix.group(2).strip()
    else:
        prefix, num = prefix_num_text, ""

    # Find the course title (e.g., from <a href="/students/crscat/aa.html#aa210">ENGR STATICS</a>)
    title_a: Tag = table.find('a', href=True)
    course_title = title_a.get_text(strip=True) if title_a else ""

    gen_ed_td: Tag = table.find('td', width='15%')
    gen_ed_text = gen_ed_td.get_text(strip=True) if gen_ed_td else ""

    prereq_td: Tag = table.find('td', align='right')
    prereq_text = prereq_td.get_text(strip=True) if prereq_td else ""
    
    return {
        'course_prefix': prefix,
        'course_number': num,
        'course_title' : course_title,
        'gen_ed_reqs'  : gen_ed_text,
        'prerequisites': prereq_text,
        'notes'        : None,
        'sections'     : []
    }

def parse_section_row(chunks: dict[str, str]) -> SectionDict|None:
    """Attempts to parse base section data from sliced chunks (requires an SLN)."""
    sln = extract_sln(chunks['sln'])
    if not sln: return None
    
    t = extract_times(chunks['times'])
    b = extract_building_room(chunks['bldg_room'])
    i = extract_instructor(chunks['instructor'])
    
    return {
        'restrictions'    : extract_restrictions(chunks['restr']),
        'SLN'             : sln,
        'section_id'      : extract_section_id(chunks['id']),
        'credits'         : extract_credits(chunks['cred']),
        'times'           : [t],
        'building_room'   : [b],
        'instructor'      : [i],
        'status'          : extract_status(chunks['status']),
        'enrollment_limit': extract_enrollment(chunks['enrl']),
        'grades'          : extract_grades(chunks['grades']),
        'fee'             : extract_fee(chunks['fee']),
        'other'           : extract_other(chunks['other']),
        'notes'           : None
    }

def parse_additional_times(chunks: dict[str, str], current_section: SectionDict) -> bool:
    """Attempts to append additional meeting times and locations to an existing section."""
    raw_t = chunks['times']
    raw_b = chunks['bldg_room']
    raw_i = chunks['instructor']
    
    t = extract_times(raw_t)
    bldg_str = extract_building_room(raw_b)
    i = extract_instructor(raw_i)
    
    # If a chunk contains text but fails its extraction regex, it is un-parseable text (i.e., a note).
    # We require all three chunks to either be completely empty or yield a successful extraction.
    t_is_valid = (not raw_t.strip()) or (t != "")
    b_is_valid = (not raw_b.strip()) or (bldg_str != "")
    i_is_valid = (not raw_i.strip()) or (i != "")
    
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

def parse_section_table(table: Tag, boundaries: dict[str, tuple[int, int|None]]) -> list[SectionDict]:
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
