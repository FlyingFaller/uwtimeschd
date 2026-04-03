import requests

def fetch_page(url: str):
    """Fetches the HTML content of a given URL gracefully."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        # Added a 10-second timeout to prevent the script from hanging indefinitely
        response = requests.get(url, headers=headers, timeout=10)
        
        # This will raise an HTTPError if the response was an error code (4xx, 5xx)
        response.raise_for_status() 
        return response.text
        
    except requests.exceptions.HTTPError as e:
        # A 404 error is expected when checking if a new quarter is published yet
        if response.status_code == 404:
            print(f"404 Not Found (Quarter not yet published?): {url}")
        else:
            print(f"HTTP Error fetching {url}: {e}")
        return None
        
    except requests.exceptions.RequestException as e:
        # Catches connection errors, DNS failures, timeouts, etc.
        print(f"Network/Request Error fetching {url}: {e}")
        return None