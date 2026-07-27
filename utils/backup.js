"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BEFORE_RESTORE_BACKUP_KEY = exports.BACKUP_KEYS = exports.BACKUP_PREFIX = void 0;
exports.createDataBackup = createDataBackup;
exports.serializeBackup = serializeBackup;
exports.parseBackup = parseBackup;
exports.restoreDataBackup = restoreDataBackup;
exports.formatBackupSummary = formatBackupSummary;
exports.BACKUP_PREFIX = 'FUSHI_DITU_BACKUP_V1';
exports.BACKUP_KEYS = [
    'babyProfile',
    'fridge',
    'manualShopList',
    'mealJournal',
    'reactions',
    'customFoods',
    'weeklyPlan',
    'setupDone',
    'onboardingDone',
    'fridgeOnboardDismissed',
    'shopDays',
];
exports.BEFORE_RESTORE_BACKUP_KEY = 'lastBeforeRestoreBackup';
function createDataBackup(now = new Date()) {
    const data = {};
    for (const key of exports.BACKUP_KEYS) {
        const value = wx.getStorageSync(key);
        if (value !== undefined && value !== '')
            data[key] = value;
    }
    return {
        app: 'fushi-ditu',
        version: 1,
        createdAt: now.toISOString(),
        keys: Object.keys(data),
        summary: summarizeBackupData(data),
        data,
    };
}
function serializeBackup(backup) {
    return `${exports.BACKUP_PREFIX}\n${JSON.stringify(backup)}`;
}
function parseBackup(raw) {
    const text = (raw || '').trim();
    const jsonText = text.startsWith(exports.BACKUP_PREFIX)
        ? text.slice(exports.BACKUP_PREFIX.length).trim()
        : text;
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch (_err) {
        throw new Error('备份内容不是有效的 JSON');
    }
    if (!isPlainObject(parsed))
        throw new Error('备份内容格式不正确');
    if (parsed.app !== 'fushi-ditu' || parsed.version !== 1) {
        throw new Error('不是辅食搭子的 v1 备份');
    }
    if (!isPlainObject(parsed.data))
        throw new Error('备份缺少 data');
    const data = {};
    const keys = [];
    for (const key of exports.BACKUP_KEYS) {
        if (Object.prototype.hasOwnProperty.call(parsed.data, key)) {
            data[key] = parsed.data[key];
            keys.push(key);
        }
    }
    if (keys.length === 0)
        throw new Error('备份里没有可恢复的数据');
    return {
        app: 'fushi-ditu',
        version: 1,
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
        keys,
        summary: summarizeBackupData(data),
        data,
    };
}
function restoreDataBackup(backup) {
    const beforeRestoreBackup = createDataBackup();
    wx.setStorageSync(exports.BEFORE_RESTORE_BACKUP_KEY, beforeRestoreBackup);
    const restoredKeys = [];
    for (const key of exports.BACKUP_KEYS) {
        if (Object.prototype.hasOwnProperty.call(backup.data, key)) {
            wx.setStorageSync(key, backup.data[key]);
            restoredKeys.push(key);
        }
    }
    return { restoredKeys, beforeRestoreBackup };
}
function formatBackupSummary(summary) {
    const name = summary.babyName || '未命名宝宝';
    const birthday = summary.birthday || '生日未设置';
    return `${name} · ${birthday}\n辅食记录 ${summary.mealJournalCount} 条 · 反应 ${summary.reactionCount} 条 · 计划 ${summary.weeklyPlanCount} 天`;
}
function summarizeBackupData(data) {
    const profile = isPlainObject(data.babyProfile) ? data.babyProfile : {};
    return {
        babyName: typeof profile.babyName === 'string' ? profile.babyName : '',
        birthday: typeof profile.birthday === 'string' ? profile.birthday : '',
        mealJournalCount: arrayLength(data.mealJournal),
        reactionCount: arrayLength(data.reactions),
        weeklyPlanCount: arrayLength(data.weeklyPlan),
        fridgeCount: arrayLength(data.fridge),
        customFoodCount: arrayLength(data.customFoods),
    };
}
function arrayLength(value) {
    return Array.isArray(value) ? value.length : 0;
}
function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
