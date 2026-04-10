import { DAYS_MAP, ATTR_MAP, QUARTER_MAP } from './constants.js';

export const getTermCode = (yearStr, quarterStr, isStartBound) => {
    if (!yearStr) return null;
    const year = parseInt(yearStr);
    if (isNaN(year)) return null;
    let qWeight = quarterStr ? QUARTER_MAP[quarterStr.toUpperCase()] : (isStartBound ? 1 : 4);
    return parseInt(`${year}${qWeight}`);
};

export const getDaysMask = (daysList) => {
    return daysList.reduce((mask, d) => mask | (DAYS_MAP[d] || 0), 0);
};

export const getAttributesMask = (attributesList) => {
    return attributesList.reduce((mask, a) => mask | (ATTR_MAP[a] || 0), 0);
};

export const sanitizeFts = (term, majorMap = {}) => {
    let clean = term.replace(/['"*:^()\[\]{}]/g, ' ').trim().toUpperCase();
    if (!clean) return "";
    
    clean = clean.replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/(\d)([a-zA-Z])/g, '$1 $2');
    const tokens = clean.split(/\s+/);
    
    return tokens.map(word => {
        if (majorMap[word]) return `("${word}"* OR "${majorMap[word]}")`;
        if (/^\d+$/.test(word)) return `"${word}"`; 
        return `"${word}"*`;
    }).join(' AND ');
};

export const formatTime = (t) => {
    if (!t) return "";
    const str = t.toString();
    return str.includes(':') ? str : str.replace(/(\d{2})$/, ':$1');
};

export const getQuarterColorClasses = (quarterStr) => {
    const upper = quarterStr.toUpperCase();
    if (upper.includes("AUT")) return "badge-aut";
    if (upper.includes("WIN")) return "badge-win";
    if (upper.includes("SPR")) return "badge-spr";
    if (upper.includes("SUM")) return "badge-sum";
    return "badge-default";
};