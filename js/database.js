import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';
import { buildWhereClause } from './utils.js';

export class DatabaseManager {
    constructor(parquetDir = "data/schedules_dataset/") { 
        this.parquetDir = parquetDir.endsWith('/') ? parquetDir : parquetDir + '/';
        this.db = null;
        this.conn = null;
        
        this.mutex = Promise.resolve();
        this.queryCounter = 0;
    }

    async init() {
        try {
            const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
            const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

            const workerScript = `importScripts("${bundle.mainWorker}");`;
            const workerBlob = new Blob([workerScript], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(workerBlob);

            const worker = new Worker(workerUrl);
            const logger = new duckdb.ConsoleLogger();
            
            this.db = new duckdb.AsyncDuckDB(logger, worker);
            await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);

            this.conn = await this.db.connect();

            // Removed the problematic JSON extension autoloading

            // 1. Fetch the multi-file manifest
            const manifestUrl = new URL('manifest.json', window.location.href + this.parquetDir).toString();
            const manifestRes = await fetch(manifestUrl);
            if (!manifestRes.ok) throw new Error("Could not load Parquet manifest.json");
            const manifest = await manifestRes.json();
            
            // 2. Register every file explicitly
            const fileList = [];
            for (const filename of manifest.files) {
                const absoluteUrl = new URL(filename, manifestUrl).toString();
                await this.db.registerFileURL(filename, absoluteUrl, duckdb.DuckDBDataProtocol.HTTP, false);
                fileList.push(`'${filename}'`);
            }
            
            // 3. Create the view spanning all Parquet files array
            await this.conn.query(`CREATE VIEW courses AS SELECT * FROM read_parquet([${fileList.join(', ')}]);`);
            
            console.log(`Warming up database across ${manifest.files.length} parts...`);
            await this.conn.query(`SELECT course_id FROM courses LIMIT 1;`);

            return true;
        } catch (error) {
            console.error("DuckDB initialization failed:", error);
            throw error;
        }
    }

    async _lockQuery(signal, queryFn, queryName = "SQL Query") {
        const queryId = ++this.queryCounter;
        
        return new Promise((resolve, reject) => {
            this.mutex = this.mutex.then(async () => {
                if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
                
                try {
                    const result = await queryFn();
                    resolve(result);
                } catch (e) {
                    console.error(`[Fatal Error] Crash during ${queryName}:`, e);
                    reject(e);
                }
            }).catch(() => {});
        });
    }

    _getOrderClause(sortBy) {
        if (sortBy === 'oldest') return `ORDER BY term_code ASC, course_prefix ASC, course_number ASC`;
        if (sortBy === 'course') return `ORDER BY course_prefix ASC, course_number ASC, term_code DESC`;
        return `ORDER BY term_code DESC, course_prefix ASC, course_number ASC`;
    }

    // --- STANDARD MODE METHODS ---

    async getTotalCount(filters, majorToPrefixes, signal) {
        if (!this.conn) throw new Error("Database not initialized");
        
        return this._lockQuery(signal, async () => {
            const whereClause = buildWhereClause(filters, majorToPrefixes);
            const sql = `SELECT COUNT(*) as count FROM courses WHERE ${whereClause}`;
            
            const arrowResult = await this.conn.query(sql);
            const rows = arrowResult.toArray();
            return Number(rows[0].count); 
        }, "Count Aggregate");
    }

    async getPage(filters, limit, offset, sortBy, majorToPrefixes, signal) {
        if (!this.conn) throw new Error("Database not initialized");
        
        return this._lockQuery(signal, async () => {
            const whereClause = buildWhereClause(filters, majorToPrefixes);
            const orderClause = this._getOrderClause(sortBy);
            const limitClause = limit === 'all' ? '' : `LIMIT ${limit} OFFSET ${offset}`;

            const sql = `SELECT * FROM courses WHERE ${whereClause} ${orderClause} ${limitClause}`;
            
            const arrowResult = await this.conn.query(sql);
            return arrowResult.toArray();
        }, "Fetch Page");
    }

    // --- UNIFIED MODE METHODS ---

    async getUnifiedTotalCount(filters, majorToPrefixes, signal) {
        if (!this.conn) throw new Error("Database not initialized");
        
        return this._lockQuery(signal, async () => {
            const whereClause = buildWhereClause(filters, majorToPrefixes);
            // Count unique courses for accurate total pagination matches
            const sql = `SELECT COUNT(DISTINCT course_prefix || course_number) as count FROM courses WHERE ${whereClause}`;
            
            const arrowResult = await this.conn.query(sql);
            const rows = arrowResult.toArray();
            return Number(rows[0].count); 
        }, "Unified Count Aggregate");
    }

    async getUnifiedPage(filters, limit, offset, majorToPrefixes, signal) {
        if (!this.conn) throw new Error("Database not initialized");
        
        return this._lockQuery(signal, async () => {
            const whereClause = buildWhereClause(filters, majorToPrefixes);
            // We translate the limit/offset into a DENSE_RANK window boundary
            const rankFilter = limit === 'all' ? '' : `WHERE course_rank > ${offset} AND course_rank <= ${offset + limit}`;

            // This returns FLAT rows cleanly without triggering the Arrow nested list bug!
            const sql = `
                WITH Filtered AS (
                    SELECT * FROM courses WHERE ${whereClause}
                ),
                Ranked AS (
                    SELECT *, DENSE_RANK() OVER (ORDER BY course_prefix ASC, course_number ASC) as course_rank
                    FROM Filtered
                )
                SELECT * FROM Ranked
                ${rankFilter}
                ORDER BY course_rank ASC, term_code DESC
            `;
            
            const arrowResult = await this.conn.query(sql);
            return arrowResult.toArray();
        }, "Fetch Unified Page");
    }
}