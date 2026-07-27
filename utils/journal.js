"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREFERENCE_EMOJI = exports.PREFERENCE_LABEL = exports.PORTION_EMOJI = exports.PORTION_LABEL = void 0;
exports.getMealTime = getMealTime;
exports.combineTime = combineTime;
exports.getJournal = getJournal;
exports.setJournal = setJournal;
exports.logMeal = logMeal;
exports.unlogMeal = unlogMeal;
exports.isMealLogged = isMealLogged;
exports.getMealLog = getMealLog;
exports.setPreference = setPreference;
function getMealTime(log) {
    return log.eatenAt || log.loggedAt;
}
function combineTime(date, hhmm) {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = hhmm.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm).toISOString();
}
exports.PORTION_LABEL = {
    taste: '尝几口',
    small: '尝几口',
    half: '半份',
    full: '1份'
};
exports.PORTION_EMOJI = {
    taste: '😊',
    small: '😊',
    half: '🥣',
    full: '🍚'
};
exports.PREFERENCE_LABEL = {
    love: '爱吃',
    dislike: '不爱吃'
};
exports.PREFERENCE_EMOJI = {
    love: '😋',
    dislike: '😐'
};
function getJournal() {
    return wx.getStorageSync('mealJournal') || [];
}
function setJournal(logs) {
    wx.setStorageSync('mealJournal', logs);
}
function logMeal(log) {
    const all = getJournal();
    const idx = all.findIndex(l => l.date === log.date && l.mealIndex === log.mealIndex);
    if (idx >= 0) {
        all[idx] = log;
    }
    else {
        all.push(log);
    }
    setJournal(all);
}
function unlogMeal(date, mealIndex) {
    const all = getJournal().filter(l => !(l.date === date && l.mealIndex === mealIndex));
    setJournal(all);
}
function isMealLogged(date, mealIndex) {
    return getJournal().some(l => l.date === date && l.mealIndex === mealIndex);
}
function getMealLog(date, mealIndex) {
    return getJournal().find(l => l.date === date && l.mealIndex === mealIndex);
}
function setPreference(date, mealIndex, preference) {
    const log = getMealLog(date, mealIndex);
    if (!log)
        return;
    if (preference === null) {
        delete log.preference;
    }
    else {
        log.preference = preference;
    }
    logMeal(log);
}
