export const DAYS_MAP = {'M': 1, 'T': 2, 'W': 4, 'Th': 8, 'F': 16, 'S': 32, 'Su': 64};

export const ATTR_MAP = {
    'W': 1,   'H': 2,   'J': 4,    'O'         : 8,    'A'       : 16,   'B'    : 32, 'E': 64, 'S': 128,
    'R': 256, '%': 512, '#': 1024, 'Restricted': 2048, 'Add Code': 4096, 'CR/NC': 8192
};

export const QUARTER_MAP = { 'WIN': 1, 'SPR': 2, 'SUM': 3, 'AUT': 4 };

export const TYPE_TITLES = {
    'LC': 'Lecture',    'QZ': 'Quiz',      'LB': 'Lab',    'SM': 'Seminar',
    'ST': 'Studio',     'PR': 'Practicum', 'CL': 'Clinic', 'CK': 'Clerkship',
    'CO': 'Conference', 'IS': 'Independent Study'
};

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