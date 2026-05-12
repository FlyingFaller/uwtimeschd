import os
import logging
from typing import Any
from management.utils import load_config
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
    
    logger.info("Running pipeline worker.")
    updates_made = run_worker_pipeline(
        queue_db_path = paths.get('queue_db', 'data/queue.db'),
        dataset_dir   = paths.get('dataset_dir', 'data/schedules_dataset'),
        registry_path = paths.get('registry_path', 'data/registry.json'),
        **targets,
        **scraping
    )
    
    if updates_made:
        logger.info("Database successfully updated.")
    else: 
        logger.info("No changes to schedule database.")

    logger.info("Completed update workflow.")

if __name__ == "__main__":
    run()