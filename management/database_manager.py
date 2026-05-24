import os
import shutil
import json
import logging
import glob
from collections import Counter
import pyarrow as pa
import pyarrow.dataset as ds
from parse.normalize import NormalizedCourseDict

logger = logging.getLogger(__name__)

# ==========================================
# PURE HELPERS (Stateless)
# ==========================================

def calculate_term_code(year: int, quarter: str) -> int:
    weights = {"WIN": 1, "SPR": 2, "SUM": 3, "AUT": 4}
    weight = weights.get(quarter.upper(), 0)
    return int(f"{year}{weight}")

def _construct_fts(course: NormalizedCourseDict) -> str:
    search_terms = [
        course['course_prefix'],
        course['course_number'],
        course['course_title'],
        *course['gen_ed_reqs']
    ]
    
    for s in course['sections']:
        search_terms.append(s['SLN'])
        for m in s['meetings']:
            search_terms.append(m['instructor'])
                
    unique_terms = {str(t).strip().lower() for t in search_terms if t}
    unique_terms.discard("")
    return " ".join(unique_terms)

def clear_database(dataset_dir: str):
    """Wipes the dataset directory entirely (used for invalidation)."""
    if os.path.exists(dataset_dir):
        shutil.rmtree(dataset_dir)
        logger.info(f"Cleared existing dataset directory at {dataset_dir}")

def clear_registry(registry_path: str):
    """Deletes the registry file."""
    if os.path.exists(registry_path):
        os.remove(registry_path)
        logger.info(f"Cleared existing registry file at {registry_path}")

# ==========================================
# DATABASE CLASS (State Encapsulation)
# ==========================================

class ScheduleDatabase:
    def __init__(self, dataset_dir: str, registry_path: str):
        self.dataset_dir = dataset_dir
        self.registry_path = registry_path
        self.courses = []
        self.registry = {
            "majors": {},
            "buildings": []
        }

    def load(self):
        """Loads Parquet datasets and JSON registry into memory."""
        if os.path.exists(self.dataset_dir):
            try:
                parquet_files = glob.glob(f"{self.dataset_dir}/*.parquet")
                dataset = ds.dataset(parquet_files, format="parquet")
                self.courses = dataset.to_table().to_pylist()
            except Exception as e:
                logger.error(f"Could not load dataset from {self.dataset_dir}: {e}")
                self.courses = []
            
        if os.path.exists(self.registry_path):
            with open(self.registry_path, 'r', encoding='utf-8') as f:
                self.registry = json.load(f)

    def _prepare_courses(self, raw_courses: list[NormalizedCourseDict], quarter: str, year: int) -> list[dict]:
        """Injects primary keys and FTS text. Internal method."""
        prepared = []
        for c in raw_courses:
            c['course_id']   = f"{year}-{quarter}-{c['course_prefix'].replace(' ','')}-{c['course_number']}"
            c['term_code']   = calculate_term_code(year, quarter)
            # c['year']        = year
            # c['quarter']     = quarter
            c['search_text'] = _construct_fts(c)
            prepared.append(c)
        return prepared

    def merge_payload(self, raw_courses: list[NormalizedCourseDict], quarter: str, year: int, major_code: str, major_name: str, college: str):
        """Integrates a scraped payload into the database state (courses & registry)."""
        if not raw_courses:
            return

        # 1. Prepare Data
        prepared_courses = self._prepare_courses(raw_courses, quarter, year)
        new_course_ids = {c['course_id'] for c in prepared_courses}

        # 2. Merge Courses (Deduplicate in-place)
        self.courses = [c for c in self.courses if c['course_id'] not in new_course_ids]
        self.courses.extend(prepared_courses)

        # 3. Extract Unique Buildings from this payload
        buildings_in_payload = set()
        for course in prepared_courses:
            for section in course.get('sections', []):
                for meeting in section.get('meetings', []):
                    br = meeting.get('building_room')
                    if br:
                        # Extract the building code (e.g., "KNE 130" -> "KNE")
                        building_code = br.split(' ')[0]
                        buildings_in_payload.add(building_code)

        # 4. Update Registry Root
        existing_buildings = set(self.registry["buildings"])
        existing_buildings.update(buildings_in_payload)
        self.registry["buildings"] = sorted(list(existing_buildings))

        # 5. Update Majors Dictionary
        majors_dict = self.registry["majors"]
        
        if major_code not in majors_dict:
            majors_dict[major_code] = {
                "major_name": major_name,
                "college": college,
                "prefixes": {}
            }
        else:
            majors_dict[major_code]["major_name"] = major_name
            majors_dict[major_code]["college"] = college
        
        payload_prefixes = Counter(c['course_prefix'] for c in prepared_courses)
        target_prefixes = majors_dict[major_code]["prefixes"]
        
        for prefix, count in payload_prefixes.items():
            target_prefixes[prefix] = target_prefixes.get(prefix, 0) + count

    def save(self, max_rows_per_file: int = 450_000):
        """Writes the in-memory state back to disk and generates a manifest."""
        # Save Parquet
        self.courses.sort(key=lambda x: (x['term_code'], x['course_prefix'], x['course_number']), reverse=True)
        table = pa.Table.from_pylist(self.courses)
        
        os.makedirs(self.dataset_dir, exist_ok=True)
        ds.write_dataset(
            data=table,
            base_dir=self.dataset_dir,
            format="parquet",
            max_rows_per_file=max_rows_per_file, 
            max_rows_per_group=max_rows_per_file, 
            existing_data_behavior="overwrite_or_ignore" 
        )
        
        # Save JSON Registry
        os.makedirs(os.path.dirname(self.registry_path), exist_ok=True)
        with open(self.registry_path, 'w', encoding='utf-8') as f:
            json.dump(self.registry, f, indent=4)

        # --- NEW: Generate manifest.json for DuckDB-Wasm ---
        parquet_files = [f for f in os.listdir(self.dataset_dir) if f.endswith('.parquet')]
        parquet_files.sort() # Ensure consistent ordering
        
        manifest_path = os.path.join(self.dataset_dir, "manifest.json")
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump({"files": parquet_files}, f, indent=4)
            
        logger.info(f"Generated manifest.json with {len(parquet_files)} file(s).")