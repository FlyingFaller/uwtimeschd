import os
import logging
from typing import Any
from management.utils import load_config, stitch_database
from management.chunk_db import chunk_database
from management.pipeline import run_worker_pipeline

# Configure the global logging format
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-8s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

logger = logging.getLogger(__name__)

def run(config=None):
    if config is None:
        config = load_config()
        
    logger.info("Update pipeline workflow.")
    
    paths   : dict[str, Any] = config.get('paths', {})
    scraping: dict[str, Any] = config.get('scraping', {})
    targets : dict[str, Any] = config.get('targets', {})
    
    logger.info("Stiching database.")

    stitch_database(
        chunk_dir   = paths.get('chunk_dir', 'data/'),
        output_path = paths.get('master_db', 'data/schedules.db')
    )

    logger.info("Running pipeline worker.")
    run_worker_pipeline(
        queue_db_path  = paths.get('queue_db', 'data/queue.db'),
        master_db_path = paths.get('master_db', 'data/schedules.db'),
        **targets,
        **scraping
    )
    
    logger.info("Chunking database.")
    chunk_database(
        db_path       = paths.get('master_db', 'data/schedules.db'),
        chunk_size_mb = scraping.get('chunk_size_mb', 50)
    )
    
    logger.info("Removing monolithic database file.")
    if os.path.exists(paths.get('master_db', '')):
        os.remove(paths.get('master_db'))
        
    logger.info("Completed update workflow.")

if __name__ == "__main__":
    run()