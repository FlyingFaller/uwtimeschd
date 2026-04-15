import os
import json
import logging

logger = logging.getLogger(__name__)

def chunk_database(db_path: str = "data/schedules.db", chunk_size_mb: int = 10):
    """
    Physically splits a SQLite database into manageable chunks for HTTP-VFS
    and generates the required config.json manifest.
    """
    if not os.path.exists(db_path):
        logging.error(f"Could not find database at '{db_path}'. Ensure the database has been generated.")
        return

    logging.info(f"Preparing to chunk '{db_path}'.")
    
    db_size     = os.path.getsize(db_path)
    db_filename = os.path.basename(db_path)
    out_dir     = os.path.dirname(db_path)
    
    # Convert MB to Bytes
    chunk_size_bytes = chunk_size_mb * 1024 * 1024 
    
    # 1. Physically split the database file
    chunk_files = []
    with open(db_path, "rb") as f:
        chunk_index = 0
        while True:
            chunk_data = f.read(chunk_size_bytes)
            if not chunk_data:
                break
                
            # Name format: schedules.db.00, schedules.db.01, etc.
            chunk_name = f"{db_filename}.{chunk_index:02d}"  
            chunk_path = os.path.join(out_dir, chunk_name)
            
            with open(chunk_path, "wb") as chunk_file:
                chunk_file.write(chunk_data)
                
            chunk_files.append(chunk_name)
            chunk_index += 1

    # 2. Create the rigid boundaries to defeat GitHub Pages gzip
    manifest = {
        "serverMode": "chunked",
        "requestChunkSize": 4096,
        "databaseLengthBytes": db_size,
        "serverChunkSize": chunk_size_bytes, 
        "chunks": chunk_files
    }
    
    manifest_path = os.path.join(out_dir, "config.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    
    logger.info(f"Successfully chunked databased.")
    logger.info(f"Split {db_size:,} bytes into {len(chunk_files)} chunk(s).")
    logger.info(f"Generated WebAssembly manifest at: {manifest_path}.")