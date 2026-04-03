from bs4 import BeautifulSoup

def parse_url_codes(html_content: str):
    """
    Extracts a clean list of child page URL codes to scrape next.
    Returns: ['aa', 'cse', 'math', ...]
    """
    if not html_content:
        return []
        
    soup = BeautifulSoup(html_content, 'html.parser')
    codes = set() # A set automatically prevents duplicates

    for a_tag in soup.find_all('a'):
        href = a_tag.get('href')

        # Filter for relative HTML links pointing to major pages
        if href and href.endswith('.html') and '/' not in href:
            code = href.replace('.html', '')
            
            # Skip the utility/index pages
            if 'index' not in code:
                codes.add(code)

    # Return as a sorted list for predictable execution order
    return sorted(list(codes))