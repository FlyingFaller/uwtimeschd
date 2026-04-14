import os
from management.utils import load_config, stitch_database
from management.chunk_db import chunk_database
from management.pipeline import run_worker_pipeline

def run(config=None):
    """
    Executes the standard update workflow. 
    Can be called by manage.py or run directly as a standalone script.
    """
    if config is None:
        config = load_config()
        
    print("\n=== STARTING AUTOMATED UPDATE ===")
    
    # 1. Stitch the database (if chunks exist)
    stitch_database(
        chunk_dir   = config['paths']['chunk_dir'],
        output_path = config['paths']['master_db']
    )
    
    # 2. Run the scraping pipeline (using config file targets)
    run_worker_pipeline(config)
    
    # 3. Chunk the newly updated database
    print("\n--- 3. Chunking Database ---")
    chunk_database(
        db_path       = config['paths']['master_db'],
        chunk_size_mb = config['scraping']['chunk_size_mb']
    )
    
    # 4. Clean up the monolithic DB so Git doesn't commit it
    if os.path.exists(config['paths']['master_db']):
        os.remove(config['paths']['master_db'])
        print(f"\n[CLEANUP] Deleted temporary monolithic database: {config['paths']['master_db']}")
        
    print("=== AUTOMATED UPDATE COMPLETE ===")

# Makes this script fully standalone for local testing
if __name__ == "__main__":
    run()