"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEVERITY_LABEL = exports.REACTION_TYPE_EMOJI = exports.REACTION_TYPE_LABEL = void 0;
exports.getReactions = getReactions;
exports.setReactions = setReactions;
exports.addReaction = addReaction;
exports.updateReaction = updateReaction;
exports.removeReaction = removeReaction;
exports.traceback72h = traceback72h;
exports.isSeverDirectAllergic = isSeverDirectAllergic;
const journal_1 = require("./journal");
exports.REACTION_TYPE_LABEL = {
    gut: '拉稀',
    rash: '红疹',
    vomit: '呕吐',
    sleepy: '嗜睡',
    fever: '发烧',
    constipation: '便秘'
};
exports.REACTION_TYPE_EMOJI = {
    gut: '💩',
    rash: '🩹',
    vomit: '🤢',
    sleepy: '😴',
    fever: '🌡️',
    constipation: '😣'
};
exports.SEVERITY_LABEL = {
    mild: '轻微',
    moderate: '中度',
    severe: '严重'
};
function getReactions() {
    return wx.getStorageSync('reactions') || [];
}
function setReactions(items) {
    wx.setStorageSync('reactions', items);
}
function addReaction(reaction) {
    const all = getReactions();
    all.push(reaction);
    setReactions(all);
}
function updateReaction(id, patch) {
    const all = getReactions();
    const idx = all.findIndex(r => r.id === id);
    if (idx >= 0) {
        all[idx] = { ...all[idx], ...patch };
        setReactions(all);
    }
}
function removeReaction(id) {
    setReactions(getReactions().filter(r => r.id !== id));
}
function traceback72h(reactionTime) {
    const reactionDate = new Date(reactionTime).getTime();
    const cutoff = reactionDate - 72 * 3600 * 1000;
    return (0, journal_1.getJournal)().filter(log => {
        const t = log.eatenAt || log.loggedAt;
        const logTime = new Date(t).getTime();
        return logTime <= reactionDate && logTime >= cutoff;
    });
}
function isSeverDirectAllergic(severity, type) {
    if (severity === 'severe')
        return true;
    if (type === 'vomit')
        return severity !== 'mild';
    return false;
}
