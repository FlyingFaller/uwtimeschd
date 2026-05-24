import os
import json
import glob
import pyarrow.dataset as ds

def update_registry_buildings(dataset_dir: str, registry_path: str):
    """
    Reads the existing Parquet database and the existing registry.json.
    Migrates the registry to the new structure {"majors": {}, "buildings": []}.
    Extracts all unique building codes across all courses and populates the root list.
    """
    
    # 1. Load and Migrate the existing registry
    if not os.path.exists(registry_path):
        print(f"Error: Registry file not found at {registry_path}")
        return
        
    with open(registry_path, 'r', encoding='utf-8') as f:
        old_registry = json.load(f)

    new_registry = {
        "majors": {},
        "buildings": []
    }

    # If it's already in the new format, unpack it. If not, treat old_registry as majors dict.
    if "majors" in old_registry:
        new_registry["majors"] = old_registry["majors"]
    else:
        new_registry["majors"] = old_registry

    # Clean up any nested 'buildings' arrays from the previous iteration if they exist
    for major_code, major_data in new_registry["majors"].items():
        if "buildings" in major_data:
            del major_data["buildings"]

    # 2. Load the Parquet dataset
    parquet_files = glob.glob(f"{dataset_dir}/*.parquet")
    if not parquet_files:
        print(f"Error: No parquet files found in {dataset_dir}")
        return
        
    print(f"Loading dataset from {len(parquet_files)} parquet files...")
    dataset = ds.dataset(parquet_files, format="parquet")
    courses = dataset.to_table().to_pylist()
    
    # 3. Extract unique buildings globally across all courses
    all_buildings = set()
    
    for course in courses:
        for section in course.get('sections', []):
            for meeting in section.get('meetings', []):
                br = meeting.get('building_room')
                if br:
                    # Extract "KNE" from "KNE 130"
                    building_code = br.split(' ')[0]
                    all_buildings.add(building_code)

    # 4. Update the root buildings array
    new_registry["buildings"] = sorted(list(all_buildings))
        
    # 5. Save the updated, standardized registry back to disk
    with open(registry_path, 'w', encoding='utf-8') as f:
        json.dump(new_registry, f, indent=4)
        
    print(f"Successfully migrated registry to root schema.")
    print(f"Discovered and saved {len(new_registry['buildings'])} unique buildings.")
    print(f"Saved changes to {registry_path}")

if __name__ == "__main__":
    # --- Edit these paths to match your project structure ---
    DATASET_DIRECTORY = "data/schedules_dataset"          # Example: "data" or "dataset"
    REGISTRY_FILE_PATH = "data/registry.json" # Example: "data/registry.json"
    
    update_registry_buildings(DATASET_DIRECTORY, REGISTRY_FILE_PATH)