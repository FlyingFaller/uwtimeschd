export const QUARTER_MAP = { 'WIN': 1, 'SPR': 2, 'SUM': 3, 'AUT': 4 };
export const REVERSE_QUARTER_MAP = { 1: 'WIN', 2: 'SPR', 3: 'SUM', 4: 'AUT' };

export const TYPE_TITLES = {
    'LC': 'Lecture',    'QZ': 'Quiz',      'LB': 'Lab',    'SM': 'Seminar',
    'ST': 'Studio',     'PR': 'Practicum', 'CL': 'Clinic', 'CK': 'Clerkship',
    'CO': 'Conference', 'IS': 'Independent Study'
};

// Moved from ui.js
export const TYPE_COLORS = {
    'LC': 'tag-blue',
    'QZ': 'tag-orange',
    'IS': 'tag-purple',
    'default': 'tag-slate'
};

// Moved from utils.js
export const ATTR_COLUMNS_MAP = {
    'W': 'writing', 'H': 'honors', 'J': 'jointly_offered', 'O': 'online',
    'A': 'asynchronous', 'B': 'hybrid', 'E': 'community_engaged',
    'S': 'service_learning', 'R': 'research', '%': 'new_course', '#': 'no_financial_aid'
};

// Automatically invert the map for service.js to hydrate data efficiently
export const PARQUET_ATTR_TO_CODE = Object.fromEntries(
    Object.entries(ATTR_COLUMNS_MAP).map(([code, column]) => [column, code])
);

export const TAG_CONFIG = {
    'W': { label: 'Writing',           tooltip: "Writing Section",                styles: "tag-indigo" },
    'H': { label: 'Honors',            tooltip: "Honors Section",                 styles: "tag-fuchsia" },
    'J': { label: 'Jointly Offered',   tooltip: "Jointly Offered",                styles: "tag-teal" },
    'O': { label: 'Online',            tooltip: "Online Only",                    styles: "tag-sky" },
    'A': { label: 'Async',             tooltip: "Asynchronous Online",            styles: "tag-sky" },
    'B': { label: 'Hybrid',            tooltip: "Hybrid",                         styles: "tag-sky" },
    'E': { label: 'Community Engaged', tooltip: "Community Engaged Learning",     styles: "tag-emerald" },
    'S': { label: 'Service Learning',  tooltip: "Service Learning",               styles: "tag-emerald" },
    'R': { label: 'Research',          tooltip: "Research Section",               styles: "tag-blue" },
    '%': { label: 'New Course',        tooltip: "New Course",                     styles: "tag-lime" },
    '#': { label: 'No FinAid',         tooltip: "Not eligible for Financial Aid", styles: "tag-red" }
};