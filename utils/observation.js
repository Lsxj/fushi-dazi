"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeSuspects = analyzeSuspects;
exports.enterObservation = enterObservation;
exports.markAllergic = markAllergic;
exports.recordRetry = recordRetry;
exports.getDueRetryFoods = getDueRetryFoods;
exports.startIntroducing = startIntroducing;
exports.checkIntroducingComplete = checkIntroducingComplete;
exports.completeIntroducing = completeIntroducing;
const categories_1 = require("../data/categories");
const dateUtil_1 = require("./dateUtil");
const RECENT_INTRO_DAYS = 14;
const COOLDOWN_DAYS = 7;
function analyzeSuspects(profile, ingredients, reactionTime) {
    const reactionMs = new Date(reactionTime).getTime();
    const recentCutoff = reactionMs - RECENT_INTRO_DAYS * 86400 * 1000;
    const confirmed = new Set(profile.confirmedFoods || []);
    const suspects = [];
    const seen = new Set();
    for (const ing of ingredients) {
        if (seen.has(ing))
            continue;
        seen.add(ing);
        const ex = profile.individualExceptions[ing];
        if (ex?.state === 'allergic')
            continue;
        if (ex?.state === 'observation') {
            suspects.push({
                name: ing,
                reason: '此食物已在观察期,本次反应可能确认过敏',
                level: 'high'
            });
            continue;
        }
        if (ex?.state === 'introducing') {
            suspects.push({
                name: ing,
                reason: '此食物正在 3 天引入观察期,首次反应可疑',
                level: 'high'
            });
            continue;
        }
        const cat = (0, categories_1.getCategoryByFood)(ing);
        const catState = cat ? profile.categoryAllergies[cat.id] : undefined;
        const catName = cat?.name || '自定义食材';
        if (cat && catState?.state === 'trying' && catState.tryingFood === ing) {
            const daysRequired = catState.tryingDaysRequired || 3;
            let dayLabel = '排敏中';
            if (catState.tryingStartDate) {
                const start = (0, dateUtil_1.parseLocalDateMs)(catState.tryingStartDate);
                const daysSince = Math.floor((reactionMs - start) / 86400000);
                const replacedCount = (catState.tryingReplacedDates || []).length;
                const dayIndex = Math.max(1, daysSince + 1 - replacedCount);
                dayLabel = `排敏第 ${dayIndex}/${daysRequired} 天`;
            }
            suspects.push({
                name: ing,
                reason: `${catName}${dayLabel},最高度可疑`,
                level: 'high'
            });
            continue;
        }
        const isConfirmed = confirmed.has(ing);
        if (isConfirmed)
            continue;
        if (cat && catState?.passedDate) {
            const opened = (0, dateUtil_1.parseLocalDateMs)(catState.passedDate);
            const daysSinceOpen = (reactionMs - opened) / (86400 * 1000);
            if (opened > recentCutoff) {
                suspects.push({
                    name: ing,
                    reason: `${catName}近 ${Math.round(daysSinceOpen)} 天才开放,高度可疑`,
                    level: 'high'
                });
            }
            else if (daysSinceOpen < 30) {
                suspects.push({
                    name: ing,
                    reason: `${catName}已稳定 ${Math.round(daysSinceOpen)} 天,可能性较低`,
                    level: 'low'
                });
            }
            continue;
        }
        suspects.push({
            name: ing,
            reason: cat ? `${catName}尚未开放,首次出现,高度可疑` : '自定义食材,未在已确认清单,高度可疑',
            level: 'high'
        });
    }
    return suspects.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.level] - order[b.level];
    });
}
function enterObservation(profile, foodName, reactionId, note, daysOverride) {
    const today = new Date();
    const days = typeof daysOverride === 'number' && daysOverride > 0 ? daysOverride : COOLDOWN_DAYS;
    const retry = new Date(today.getTime() + days * 86400 * 1000);
    profile.individualExceptions[foodName] = {
        state: 'observation',
        enteredAt: today.toISOString().slice(0, 10),
        reasonReactionId: reactionId,
        nextRetryDate: retry.toISOString().slice(0, 10),
        note: note || (days < COOLDOWN_DAYS ? `反应后暂停 ${days} 天观察` : '反应后自动加观察期')
    };
    return profile;
}
function markAllergic(profile, foodName, reactionId, note) {
    const today = new Date().toISOString().slice(0, 10);
    const existing = profile.individualExceptions[foodName];
    profile.individualExceptions[foodName] = {
        state: 'allergic',
        enteredAt: today,
        reasonReactionId: reactionId,
        note: note || '严重反应直接确诊',
        retryHistory: existing?.retryHistory
    };
    return profile;
}
function recordRetry(profile, foodName, result) {
    const today = new Date().toISOString().slice(0, 10);
    const ex = profile.individualExceptions[foodName];
    if (!ex)
        return profile;
    const history = ex.retryHistory || [];
    history.push({ date: today, result });
    if (result === 'pass') {
        delete profile.individualExceptions[foodName];
        if (!profile.confirmedFoods)
            profile.confirmedFoods = [];
        if (!profile.confirmedFoods.includes(foodName)) {
            profile.confirmedFoods.push(foodName);
        }
        if (!profile.recentlyAddedFoods)
            profile.recentlyAddedFoods = [];
        if (!profile.recentlyAddedFoods.find(f => f.name === foodName)) {
            profile.recentlyAddedFoods.push({ name: foodName, addedAt: today });
        }
    }
    else {
        profile.individualExceptions[foodName] = {
            ...ex,
            state: 'allergic',
            note: `${history.length} 次反应,确诊过敏`,
            retryHistory: history
        };
    }
    return profile;
}
function getDueRetryFoods(profile) {
    const today = new Date().toISOString().slice(0, 10);
    const result = [];
    for (const [name, ex] of Object.entries(profile.individualExceptions)) {
        if (ex.state === 'observation' && ex.nextRetryDate && ex.nextRetryDate <= today) {
            result.push({ name, ex });
        }
    }
    return result;
}
const INTRODUCE_DAYS = 3;
function startIntroducing(profile, foodName) {
    const today = new Date();
    const due = new Date(today.getTime() + INTRODUCE_DAYS * 86400 * 1000);
    profile.individualExceptions[foodName] = {
        state: 'introducing',
        enteredAt: today.toISOString().slice(0, 10),
        nextRetryDate: due.toISOString().slice(0, 10),
        note: `3 天引入观察`
    };
    return profile;
}
function checkIntroducingComplete(profile) {
    const today = new Date().toISOString().slice(0, 10);
    const completed = [];
    for (const [name, ex] of Object.entries(profile.individualExceptions)) {
        if (ex.state === 'introducing' && ex.nextRetryDate && ex.nextRetryDate <= today) {
            completed.push(name);
        }
    }
    return completed;
}
function completeIntroducing(profile, foodName) {
    delete profile.individualExceptions[foodName];
    if (!profile.confirmedFoods)
        profile.confirmedFoods = [];
    if (!profile.confirmedFoods.includes(foodName)) {
        profile.confirmedFoods.push(foodName);
    }
    if (!profile.recentlyAddedFoods)
        profile.recentlyAddedFoods = [];
    const today = new Date().toISOString().slice(0, 10);
    if (!profile.recentlyAddedFoods.find(f => f.name === foodName)) {
        profile.recentlyAddedFoods.push({ name: foodName, addedAt: today });
    }
    return profile;
}
