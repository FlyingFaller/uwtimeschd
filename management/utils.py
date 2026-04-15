import json
import os
import glob
import requests
from typing import Any
from time import sleep
import logging

logger = logging.getLogger(__name__)

def load_config(path: str = "config.json") -> dict[str: dict[str: Any]]:
    """Loads the universal JSON configuration."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"Configuration file not found at {path}")
    with open(path, 'r') as f:
        return json.load(f)

def stitch_database(chunk_dir: str = "data/", output_path: str = "data/schedules.db") -> bool:
    """
    Reassembles .00, .01 chunks into a single SQLite file.
    Returns True if stitched, False if no chunks were found.
    """
    chunks = sorted(glob.glob(os.path.join(chunk_dir, "schedules.db.*")))
    
    if not chunks:
        logger.warning(f"No chunks found in {chunk_dir}. Assuming fresh database.")
        
        return False
        
    logger.info(f"Reassembling {len(chunks)} chunks into {output_path}.")
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'wb') as outfile:
        for chunk in chunks:
            with open(chunk, 'rb') as infile:
                outfile.write(infile.read())
                
    logger.info(f"Reassembly complete.")
    return True

def fetch_page(url: str, delay:float = 0.5) -> tuple[int, str|None]:
    """
    Fetches the HTML content of a given URL gracefully.
    
    Returns:
        tuple: (status_code, html_content)
        - status_code: The HTTP status code (e.g., 200, 404, 401), or None if a network error occurred.
        - html_content: The HTML string if successful, or None if the request failed or was intercepted.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        # Added a 10-second timeout to prevent the script from hanging indefinitely
        response = requests.get(url, headers=headers, timeout=10)

        sleep(delay) # Sleep so we don't spam

        if response.ok:
            # INTERCEPT: Check if UW is redirecting us to the Shibboleth login page
            if "<title>Shibboleth Authentication Request</title>" in response.text:
                return 401, None
                
            return response.status_code or 0, response.text
        else:
            # Returns the error code (e.g., 404, 500) but no HTML content
            logger.warning(f"Fetch completed with status code: {response.status_code}.")
            return response.status_code or 0, None
            
    except requests.exceptions.RequestException as e:
        # Catches connection errors, DNS failures, timeouts, etc.
        # Returning None for the status code indicates a failure to even reach the server
        logger.error(f"Failed to fetch with error {e}.")
        return 0, None