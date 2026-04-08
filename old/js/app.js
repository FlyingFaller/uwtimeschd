import { initDatabase, executeSearch, getUniqueMajors } from './database.js';
import { initUI, renderCourses, renderMajors, getFilterState, setReadyState } from './ui.js';

// Configuration
const DB_URL = "data/schedules.db"; 

// App State
let dbInstance = null;

// Catch ANY hidden JS errors (like failed CDN imports or syntax errors) and force them onto the screen
window.addEventListener('error', (event) => {
    const loadingText = document.getElementById('loading-text');
    if(loadingText) {
        loadingText.innerText = "Fatal Script Error";
        loadingText.classList.add('text-red-600');
        document.querySelector('#loading-overlay p').innerHTML = `
            <div class="mt-4 text-left font-mono text-xs bg-red-50 text-red-800 p-4 border border-red-200 rounded max-w-xl break-words">
                <strong>Error:</strong> ${event.message} <br>
                <strong>File:</strong> ${event.filename}:${event.lineno}
            </div>
        `;
        document.querySelector('#loading-overlay i').classList.replace('animate-spin', 'text-red-500');
        document.querySelector('#loading-overlay i').setAttribute('data-lucide', 'alert-triangle');
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }
});

async function boot() {
    if(typeof lucide !== 'undefined') lucide.createIcons();
    
    try {
        console.log("[Debug] Starting boot sequence...");
        const loadingText = document.getElementById('loading-text');
        const loadingDesc = document.querySelector('#loading-overlay p');
        
        // Debug Step 1: Network Check
        loadingText.innerText = "Checking file access (Step 1/3)...";
        loadingDesc.innerText = `Looking for ${DB_URL}...`;
        console.log(`[Debug] Pinging ${DB_URL} to check if it exists...`);
        
        // Add cache-busting to bypass aggressive browser caching from earlier test runs
        const fileCheck = await fetch(DB_URL + '?nocache=' + new Date().getTime(), { method: 'HEAD' });
        if (!fileCheck.ok) {
            throw new Error(`HTTP ${fileCheck.status}: Cannot find ${DB_URL}. Is your server running in the root directory?`);
        }
        console.log(`[Debug] File found. Status: ${fileCheck.status}`);
        
        // Debug Step 2: WASM Init
        loadingText.innerText = "Loading WebAssembly Worker (Step 2/3)...";
        loadingDesc.innerText = "Downloading SQL engine from CDN...";
        console.log("[Debug] Initializing sql.js-httpvfs...");
        
        // 1. Load Database using sql.js-httpvfs
        dbInstance = await initDatabase(DB_URL);
        console.log("[Debug] HTTP VFS Database connected successfully.");
        
        // Debug Step 3: Test Query
        loadingText.innerText = "Fetching Majors (Step 3/3)...";
        loadingDesc.innerText = "Running initial test query...";
        console.log("[Debug] Executing getUniqueMajors()...");
        
        // 2. Dynamically Fetch all ~350 unique majors from the actual DB!
        const majors = await getUniqueMajors(dbInstance);
        renderMajors(majors);
        console.log(`[Debug] Successfully loaded ${majors.length} majors.`);
        
        // 3. Hide loading screen
        document.getElementById('loading-overlay').classList.add('hidden');
        
        // 4. Initialize UI handlers and bind the search execution
        initUI(handleSearch);
        
        // 5. Run an initial empty search to populate the screen
        await handleSearch();
        
    } catch (err) {
        console.error("[FATAL ERROR] Failed to boot app:", err);
        
        document.getElementById('loading-text').innerText = "Boot Failed";
        document.getElementById('loading-text').classList.add('text-red-600');
        
        const errorP = document.querySelector('#loading-overlay p');
        errorP.innerHTML = `
            <div class="mt-4 text-left font-mono text-xs bg-red-50 text-red-800 p-4 border border-red-200 rounded max-w-xl break-words">
                <strong>Error:</strong> ${err.message} <br><br>
                <strong>Troubleshooting:</strong><br>
                1. Hard refresh (Ctrl+F5) to clear cached local files.<br>
                2. Press F12 to check the Browser Console for red errors.<br>
                3. Check if the file size of <code>${DB_URL}</code> is 0 bytes.
            </div>
        `;
        
        document.querySelector('#loading-overlay i').classList.replace('animate-spin', 'text-red-500');
        document.querySelector('#loading-overlay i').setAttribute('data-lucide', 'alert-triangle');
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// The core function triggered by the UI Search Button
async function handleSearch() {
    if (!dbInstance) return;
    
    const searchBtn = document.getElementById('search-btn');
    const originalText = searchBtn.innerText;
    searchBtn.innerText = "Searching..."; // Provide feedback during network chunks
    
    try {
        // 1. Read DOM for current filter values
        const filters = getFilterState();
        
        // 2. Query Remote SQLite DB via HTTP VFS
        const results = await executeSearch(dbInstance, filters);
        
        // 3. Render HTML
        renderCourses(results);
        
        // 4. Auto-expand if highly specific
        if (results.length > 0 && results.length <= 3 && filters.query.length > 2) {
            document.querySelectorAll('details.course-card').forEach(d => d.open = true);
        }
        
        // 5. Reset UI search button state
        setReadyState(filters);
    } catch (err) {
        console.error("Search Query Failed:", err);
        alert("An error occurred while querying the database.");
    } finally {
        searchBtn.innerText = originalText;
    }
}

// FIX: Because module scripts are deferred automatically, DOMContentLoaded 
// might have already fired. We check the readyState directly to guarantee boot() runs.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}