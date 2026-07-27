"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLocalDateMs = parseLocalDateMs;
exports.todayLocalStr = todayLocalStr;
exports.formatLocalDate = formatLocalDate;
exports.todayLocalStartMs = todayLocalStartMs;
exports.daysBetweenDates = daysBetweenDates;
exports.daysSinceDateStr = daysSinceDateStr;
function parseLocalDateMs(dateStr) {
    if (!dateStr)
        return NaN;
    const dateOnly = dateStr.slice(0, 10);
    const parts = dateOnly.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
        return new Date(dateStr).getTime();
    }
    return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
}
function todayLocalStr() {
    const d = new Date();
    return formatLocalDate(d);
}
function formatLocalDate(d) {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
function todayLocalStartMs() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function daysBetweenDates(a, b) {
    const aMs = parseLocalDateMs(a);
    const bMs = parseLocalDateMs(b);
    if (isNaN(aMs) || isNaN(bMs))
        return 0;
    return Math.round((bMs - aMs) / 86400000);
}
function daysSinceDateStr(dateStr) {
    const ms = parseLocalDateMs(dateStr);
    if (isNaN(ms))
        return 0;
    return Math.max(0, Math.floor((todayLocalStartMs() - ms) / 86400000));
}
