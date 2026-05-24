/**
 * Stage 3: The SQL Compiler
 * Emits optimized DuckDB strings relying heavily on nested array lambda queries.
 * Handles '=' vs 'LIKE' optimizations to leverage DuckDB Zonemaps.
 */
export class SQLCompiler {
    compile(ast) {
        // if (!ast) return "1=1";
        if (!ast) return null; // Now return null in no valid query
        return this.visit(ast);
    }

    visit(node) {
        // if (!node) return "1=1";
        if (!node) return null;
        switch (node.type) {
            case 'AND': return `(${this.visit(node.left)} AND ${this.visit(node.right)})`;
            case 'OR': return `(${this.visit(node.left)} OR ${this.visit(node.right)})`;
            case 'NOT': return `(NOT ${this.visit(node.value)})`;
            case 'EXACT': 
                return `search_text ILIKE '%${node.value.replace(/'/g, "''")}%'`;
            case 'WORD':
                return `search_text ILIKE '%${node.value.replace(/'/g, "''")}%'`;
            case 'SPECIFIER':
                const sqlStr = this.compileSpecifier(node.key, node.value);
                console.log(`[Compiler] Translated Specifier [${node.key}: "${node.value}"] => ${sqlStr}`);
                return sqlStr;
            // default: return "1=1";
            default: return null;
        }
    }

    compileSpecifier(key, val) {
        val = val.replace(/'/g, "''"); // SQL injection safety
        
        // Zonemap check for optimized exact scans vs string wildcards
        const isLike = val.includes('%') || val.includes('_');
        const op = isLike ? 'ILIKE' : '='; 
        
        switch (key) {
            case 'course_prefix':
                return isLike ? `course_prefix ILIKE '${val}'` : `course_prefix = '${val.toUpperCase()}'`;
            
            case 'course_number':
                if (isLike) return `CAST(course_number AS VARCHAR) LIKE '${val}'`;
                if (isNaN(Number(val))) return `CAST(course_number AS VARCHAR) = '${val}'`; // Strict Type Cast Catch
                return `course_number = ${parseInt(val, 10)}`;
            
            case 'course': {
                // Splits perfectly back into Prefix and Number to bypass concat queries
                const match = val.match(/^(.+?)\s*([%_\d]+)$/);
                if (match) {
                    const prefix = match[1].trim();
                    const num = match[2];
                    
                    const numIsLike = num.includes('%') || num.includes('_');
                    const prefixIsLike = prefix.includes('%') || prefix.includes('_');
                    
                    const prefixExpr = prefixIsLike ? `course_prefix ILIKE '${prefix}'` : `course_prefix = '${prefix.toUpperCase()}'`;
                    const numExpr = numIsLike ? `CAST(course_number AS VARCHAR) LIKE '${num}'` : `course_number = ${parseInt(num, 10)}`;
                    
                    return `(${prefixExpr} AND ${numExpr})`;
                } else {
                    // Fallback for explicitly forced un-splittable logic (e.g. course:'CSE340J')
                    return isLike 
                        ? `(course_prefix || CAST(course_number AS VARCHAR)) ILIKE '${val.replace(/\s+/g, '')}'` 
                        : `(course_prefix || CAST(course_number AS VARCHAR)) = '${val.replace(/\s+/g, '').toUpperCase()}'`;
                }
            }
            
            case 'building':
                // Handles standalone building request
                if (isLike) {
                    return `len(list_filter(sections, s -> len(list_filter(s.meetings, m -> m.building_room ILIKE '${val}%')) > 0)) > 0`;
                } else {
                    // Optimized exact match avoids wildcard ILIKE scan completely
                    return `len(list_filter(sections, s -> len(list_filter(s.meetings, m -> (m.building_room LIKE '${val.toUpperCase()} %' OR m.building_room = '${val.toUpperCase()}'))) > 0)) > 0`;
                }
                
            case 'room':
                // Exact Room matching: ensures we hit e.g. '340J' correctly at the end of the building_room string
                return `len(list_filter(sections, s -> len(list_filter(s.meetings, m -> (m.building_room ILIKE '% ${val}' OR m.building_room = '${val}'))) > 0)) > 0`;
                
            case 'building_room':
                return `len(list_filter(sections, s -> len(list_filter(s.meetings, m -> m.building_room ${op} '${isLike ? val : val.toUpperCase()}')) > 0)) > 0`;
                
            case 'sln':
                if (isLike) return `len(list_filter(sections, s -> CAST(s.sln AS VARCHAR) LIKE '${val}')) > 0`;
                if (isNaN(Number(val))) return `len(list_filter(sections, s -> CAST(s.sln AS VARCHAR) = '${val}')) > 0`; 
                return `len(list_filter(sections, s -> s.sln = ${parseInt(val, 10)})) > 0`;
            
            case 'instructor':
            case 'prof':
                return `len(list_filter(sections, s -> len(list_filter(s.meetings, m -> m.instructor ILIKE '%${val}%')) > 0)) > 0`;
                
            case 'title':
                return `course_title ILIKE '%${val}%'`;
                
            case 'gened':
                return `len(list_filter(gen_ed_reqs, g -> g ILIKE '%${val}%')) > 0`;
                
            default:
                return `search_text ILIKE '%${val}%'`;
        }
    }
}