/**
 * Stage 2: The Semantic Expander
 * Plucks recognizable semantic fragments globally from within a generic text query using Regex boundaries.
 * Enforces the strict taxonomy: course_prefix, course_number, course, building, room, building_room, sln.
 */
export class SemanticExpander {
    constructor(prefixToMajor = {}, validBuildings = []) {
        this.aliasMap = new Map();

        const addAlias = (alias, type, official) => {
            const cleanAlias = alias.toUpperCase().trim().replace(/\s+/g, ' ');
            if (!this.aliasMap.has(cleanAlias)) {
                this.aliasMap.set(cleanAlias, { courses: new Set(), buildings: new Set() });
            }
            this.aliasMap.get(cleanAlias)[type].add(official);
        };

        // 1. Create an inverse mapping of prefixToMajor to get major -> primary prefix
        const invertedMajorToPrefix = {};
        for (const [prefix, majorCode] of Object.entries(prefixToMajor)) {
            if (!invertedMajorToPrefix[majorCode]) {
                invertedMajorToPrefix[majorCode] = prefix;
            }
        }

        // Map major code to the primary prefix
        for (const [majorCode, primaryPrefix] of Object.entries(invertedMajorToPrefix)) {
            addAlias(majorCode, 'courses', primaryPrefix);
        }

        // 2. Map spaceless prefixes to official prefixes, and map official to official
        for (const prefix of Object.keys(prefixToMajor)) {
            addAlias(prefix, 'courses', prefix); // e.g. "M E" -> "M E"
            addAlias(prefix.replace(/\s+/g, ''), 'courses', prefix); // e.g. "ME" -> "M E"
        }

        // 3. Map Valid Buildings
        for (const b of validBuildings) {
            addAlias(b, 'buildings', b);
        }

        // Sort largest substrings first (e.g. "APP MATH" matched before "MATH")
        this.aliases = Array.from(this.aliasMap.keys()).sort((a, b) => b.length - a.length);
        console.log(`[Expander] Constructed Alias Map with ${this.aliases.length} mapped aliases.`);
    }

    expand(ast) {
        return this.visit(ast);
    }

    visit(node) {
        if (!node) return null;
        switch (node.type) {
            case 'AND': return { type: 'AND', left: this.visit(node.left), right: this.visit(node.right) };
            case 'OR': return { type: 'OR', left: this.visit(node.left), right: this.visit(node.right) };
            case 'NOT': return { type: 'NOT', value: this.visit(node.value) };
            case 'EXACT': return node;
            case 'SPECIFIER': return this.visitSpecifier(node);
            case 'WORD': return this.visitWord(node.value);
            default: return node;
        }
    }

    visitSpecifier(node) {
        let val = node.value.replace(/\*/g, '%').replace(/\?/g, '_');
        const key = node.key;

        // --- FIX 3: Intelligently resolve aliases for explicit specifiers ---
        if (['course', 'course_prefix', 'building', 'room', 'building_room'].includes(key)) {
            const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
            const aliasPattern = this.aliases.map(escapeRegExp).join('|');
            // Check if the explicitly provided value matches an alias + optional suffix
            const aliasRe = new RegExp(`^(${aliasPattern})(?:\\s*([a-zA-Z0-9%_]+))?$`, 'i');
            
            const m = aliasRe.exec(val);
            if (m) {
                const aliasStr = m[1].toUpperCase();
                const numStr = m[2] ? m[2].toUpperCase() : "";
                
                const meta = this.aliasMap.get(aliasStr) || this.aliasMap.get(aliasStr.replace(/\s+/g, ''));
                
                if (meta) {
                    const isCourseKey = ['course', 'course_prefix'].includes(key);
                    const isBldgKey = ['building', 'room', 'building_room'].includes(key);

                    // Strictly respect the user's explicit lane (don't inject building aliases into course specifiers)
                    if (isCourseKey && meta.courses.size > 0) {
                        const official = Array.from(meta.courses)[0];
                        val = numStr ? `${official} ${numStr}` : official;
                    } else if (isBldgKey && meta.buildings.size > 0) {
                        const official = Array.from(meta.buildings)[0];
                        val = numStr ? `${official} ${numStr}` : official;
                    }
                }
            }
        }

        console.log(`[Expander] Specifier Normalized: ${key}:"${val}"`);
        return { type: 'SPECIFIER', key: key, value: val };
    }

    visitWord(text) {
        // Normalize extra whitespace and wildcards globally for predictability
        text = text.replace(/\s+/g, ' ').replace(/\*/g, '%').replace(/\?/g, '_').trim();
        if (!text) return null;
        
        console.group(`[Expander] Scanning WORD node: "${text}"`);
        let resultNodes = [];

        while (text.length > 0) {
            let earliestMatch = null;

            // 1. SLN Match (4-5 digits optionally wrapped in wildcards)
            const slnRe = /(?:^|\s)([%_]*\d{4,5}[%_]*)(?!\w)/i;
            const slnMatch = slnRe.exec(text);
            if (slnMatch) {
                const leadingSpace = slnMatch[0].match(/^\s/) ? 1 : 0;
                earliestMatch = {
                    index: slnMatch.index + leadingSpace,
                    length: slnMatch[0].length - leadingSpace,
                    node: { type: 'SPECIFIER', key: 'sln', value: slnMatch[1].trim() },
                    logData: `SLN => ${slnMatch[1].trim()}`
                };
            }

            // 2. Isolated Number + Wildcard Match 
            // Note: [%_]+ at the beginning guarantees the wildcard PRECEDES the number. (Prevents "120A *")
            const isoNumRe = /(?:^|\s)([%_]+\s*[a-zA-Z0-9]{1,5}[%_]*)(?!\w)/i;
            const isoMatch = isoNumRe.exec(text);
            if (isoMatch) {
                const leadingSpace = isoMatch[0].match(/^\s/) ? 1 : 0;
                const matchIndex = isoMatch.index + leadingSpace;
                
                if (!earliestMatch || matchIndex < earliestMatch.index) {
                    const matchLen = isoMatch[0].length - leadingSpace;
                    const val = isoMatch[1].replace(/\s+/g, '');
                    
                    const isStrictCourse = /^[\d%_]+$/.test(val);
                    let node = isStrictCourse 
                        ? { type: 'OR', left: { type: 'SPECIFIER', key: 'course_number', value: val }, right: { type: 'SPECIFIER', key: 'room', value: val } }
                        : { type: 'SPECIFIER', key: 'room', value: val };

                    earliestMatch = { 
                        index: matchIndex, length: matchLen, node: node, 
                        logData: `Isolated Number => [course_number/room OR] ${val}`
                    };
                }
            }

            // 3. Alias + Suffix Match (Collision Handling)
            const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
            const aliasPattern = this.aliases.map(escapeRegExp).join('|');
            // const aliasRe = new RegExp(`(?:^|\\s)(${aliasPattern})(?:\\s+([a-zA-Z0-9%_]+))?(?!\\w)`, 'ig');
            const aliasRe = new RegExp(`(?:^|\\s)(${aliasPattern})(?:\\s*([a-zA-Z0-9%_]+))?(?!\\w)`, 'ig');
            
            let m;
            while ((m = aliasRe.exec(text)) !== null) {
                const leadingSpace = m[0].match(/^\s/) ? 1 : 0;
                const matchIndex = m.index + leadingSpace;
                
                if (earliestMatch && matchIndex >= earliestMatch.index) continue;

                const aliasStr = m[1].toUpperCase();
                const numStr = m[2] ? m[2].toUpperCase() : "";
                
                const meta = this.aliasMap.get(aliasStr) || this.aliasMap.get(aliasStr.replace(/\s+/g, ''));
                if (!meta) continue;

                const isCourseAlias = meta.courses.size > 0;
                const isBldgAlias = meta.buildings.size > 0;

                // Courses cannot have letters in suffix. Buildings can.
                let validAsCourse = isCourseAlias && numStr.match(/^[\d%_]{1,3}$/);
                let validAsBldg = isBldgAlias && numStr.match(/^[a-zA-Z0-9%_]{1,5}$/);
                
                if (!numStr && aliasStr.match(/[%_]/)) {
                    validAsCourse = isCourseAlias;
                    validAsBldg = isBldgAlias;
                }

                if (validAsCourse || validAsBldg) {
                    let orNodes = [];
                    // Adhere STRICTLY to the requested nomenclature:
                    if (validAsCourse) {
                        const key = numStr ? 'course' : 'course_prefix';
                        for (let official of meta.courses) {
                            const val = numStr ? `${official} ${numStr}` : official;
                            orNodes.push({ type: 'SPECIFIER', key: key, value: val });
                        }
                    }
                    if (validAsBldg) {
                        const key = numStr ? 'building_room' : 'building';
                        for (let official of meta.buildings) {
                            const val = numStr ? `${official} ${numStr}` : official;
                            orNodes.push({ type: 'SPECIFIER', key: key, value: val });
                        }
                    }

                    if (orNodes.length > 0) {
                        let combined = orNodes[0];
                        for (let i = 1; i < orNodes.length; i++) {
                            combined = { type: 'OR', left: combined, right: orNodes[i] };
                        }
                        
                        earliestMatch = {
                            index: matchIndex,
                            length: m[0].length - leadingSpace,
                            node: combined,
                            logData: `Alias/Collision => [Alias:${aliasStr}, Suffix:${numStr}] => Translated into OR tree`
                        };
                    }
                }
            }

            // 4. Evaluate extraction & Slicing
            if (earliestMatch) {
                console.log(`[Expander] Plucked: ${earliestMatch.logData}`);
                
                if (earliestMatch.index > 0) {
                    const genericStr = text.substring(0, earliestMatch.index).trim();
                    if (genericStr) {
                        resultNodes.push({ type: 'WORD', value: genericStr });
                        console.log(`[Expander] Leftover text wrapped as WORD: "${genericStr}"`);
                    }
                }

                resultNodes.push(earliestMatch.node);
                text = text.substring(earliestMatch.index + earliestMatch.length);
            } else {
                if (text.trim()) {
                    resultNodes.push({ type: 'WORD', value: text.trim() });
                    console.log(`[Expander] Unmatched remainder wrapped as WORD: "${text.trim()}"`);
                }
                break;
            }
        }

        console.groupEnd();
        
        if (resultNodes.length === 0) return null;
        return resultNodes.reduce((acc, curr) => ({ type: 'AND', left: acc, right: curr }));
    }
}