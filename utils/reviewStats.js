"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIngredientEmoji = getIngredientEmoji;
exports.getFirstSeenMap = getFirstSeenMap;
exports.isFoodNew = isFoodNew;
exports.summarize7Days = summarize7Days;
exports.formatDelta = formatDelta;
exports.buildTimeline = buildTimeline;
const journal_1 = require("./journal");
const reactions_1 = require("./reactions");
const categories_1 = require("../data/categories");
const dateUtil_1 = require("./dateUtil");
const INGREDIENT_EMOJI = {
    '猪肉': '🐷', '牛肉': '🐂', '羊肉': '🐑', '鸡肉': '🐔', '鸡胸肉': '🐔', '鸡腿肉': '🐔',
    '鸭肉': '🦆', '猪肝': '🥩', '鸡肝': '🥩', '排骨': '🥩',
    '虾': '🦐', '蟹': '🦀',
    '鳕鱼': '🐟', '三文鱼': '🐟', '鲈鱼': '🐟', '龙利鱼': '🐟', '黄花鱼': '🐟', '巴沙鱼': '🐟', '银鱼': '🐟',
    '蛋黄': '🥚', '蛋白': '🥚', '鹌鹑蛋': '🥚', '鸭蛋': '🥚',
    '豆腐': '🟨', '豆浆': '🥛',
    '南瓜': '🎃', '冬瓜': '🟢', '黄瓜': '🥒', '西葫芦': '🥒', '茄子': '🍆', '番茄': '🍅', '苦瓜': '🥒',
    '胡萝卜': '🥕', '土豆': '🥔', '红薯': '🍠', '紫薯': '🍠', '山药': '🥢', '白萝卜': '🥢', '藕': '🥢',
    '西兰花': '🥦', '花椰菜': '🥦', '卷心菜': '🥬', '紫甘蓝': '🥬',
    '菠菜': '🌿', '小白菜': '🌿', '油菜': '🌿', '生菜': '🥬', '上海青': '🌿', '空心菜': '🌿', '苋菜': '🌿',
    '香菇': '🍄', '平菇': '🍄', '金针菇': '🍄', '木耳': '🟫',
    '苹果': '🍎', '梨': '🍐', '香蕉': '🍌', '火龙果': '🐉', '蓝莓': '🫐', '牛油果': '🥑',
    '木瓜': '🥭', '哈密瓜': '🍈', '西瓜': '🍉', '葡萄': '🍇', '桃子': '🍑', '樱桃': '🍒',
    '芒果': '🥭', '菠萝': '🍍', '猕猴桃': '🥝', '草莓': '🍓', '橙子': '🍊',
    '大米': '🍚', '小米': '🌾', '燕麦': '🌾', '糙米': '🌾',
    '高铁米粉': '🍚', '婴儿米粉': '🍚', '婴儿面条': '🍜', '面条': '🍜',
    '核桃油': '🫒', '亚麻籽油': '🫒', '橄榄油': '🫒', '芝麻油': '🫒',
    '奶酪粉': '🧀', '海苔碎': '🍙', '芝麻粉': '🌰', '虾皮粉': '🦐',
    '酸奶': '🥛',
    '自制浓汤宝': '🥣', '自制肉松': '🥩', '自制果泥块': '🍎', '自制骨汤': '🍲'
};
const CATEGORY_EMOJI_FALLBACK = {
    staple: '🍚', protein: '🥩', veg: '🥬', fruit: '🍎',
    oil: '🫒', condiment: '🧂', preprocessed: '🍲', product: '🍼'
};
function getIngredientEmoji(name) {
    if (INGREDIENT_EMOJI[name])
        return INGREDIENT_EMOJI[name];
    const cat = (0, categories_1.getCategoryByFood)(name);
    if (cat)
        return CATEGORY_EMOJI_FALLBACK[cat.mainCategory] || '🥄';
    return '🥄';
}
function getFirstSeenMap() {
    const map = new Map();
    const logs = (0, journal_1.getJournal)();
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.mealIndex - b.mealIndex);
    for (const log of sorted) {
        for (const ing of log.ingredients || []) {
            if (!map.has(ing))
                map.set(ing, log.date);
        }
    }
    return map;
}
const NEW_INTRO_DAYS = 7;
function isFoodNew(ingName, log, firstSeen, profile) {
    if (firstSeen.get(ingName) !== log.date)
        return false;
    if (!(0, categories_1.getCategoryByFood)(ingName))
        return true;
    if (!profile)
        return false;
    const ex = profile.individualExceptions[ingName];
    if (ex?.state === 'introducing')
        return true;
    const cat = (0, categories_1.getCategoryByFood)(ingName);
    if (cat) {
        const catState = profile.categoryAllergies[cat.id];
        if (catState?.state === 'trying' && catState.tryingFood === ingName)
            return true;
    }
    const rec = (profile.recentlyAddedFoods || []).find(f => f.name === ingName);
    if (rec) {
        const daysSince = (Date.now() - (0, dateUtil_1.parseLocalDateMs)(rec.addedAt)) / 86400000;
        if (daysSince >= 0 && daysSince <= NEW_INTRO_DAYS)
            return true;
    }
    return false;
}
const NUTRITION_DIMS = [
    { key: 'greenVeg', label: '未吃绿叶菜', emoji: '🌿', cats: ['leafy', 'cruciferous'] },
    { key: 'redMeat', label: '未吃红肉', emoji: '🥩', cats: ['redMeat'] },
    { key: 'fish', label: '未吃鱼', emoji: '🐟', cats: ['fish'] },
    { key: 'fruit', label: '未吃水果', emoji: '🍎', cats: ['fruitLow', 'fruitMelon', 'fruitStoneBerry', 'fruitCitrus', 'fruitHigh'] }
];
function daysSinceLastInCats(logs, cats, todayMs) {
    const catSet = new Set(cats);
    let latestMs = -Infinity;
    for (const log of logs) {
        const hit = (log.ingredients || []).some(ing => {
            const c = (0, categories_1.getCategoryByFood)(ing);
            return !!c && catSet.has(c.id);
        });
        if (hit) {
            const ms = (0, dateUtil_1.parseLocalDateMs)(log.date);
            if (ms > latestMs)
                latestMs = ms;
        }
    }
    if (latestMs === -Infinity) {
        const earliest = logs.reduce((acc, l) => {
            const ms = (0, dateUtil_1.parseLocalDateMs)(l.date);
            return acc === null || ms < acc ? ms : acc;
        }, null);
        return earliest !== null ? Math.max(0, Math.floor((todayMs - earliest) / 86400000)) : 0;
    }
    return Math.max(0, Math.floor((todayMs - latestMs) / 86400000));
}
function summarize7Days(profile, refDate) {
    const ref = refDate || new Date();
    const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const thisWeekStart = new Date(today.getTime() - 6 * 86400 * 1000);
    const lastWeekStart = new Date(today.getTime() - 13 * 86400 * 1000);
    const lastWeekEnd = new Date(today.getTime() - 7 * 86400 * 1000);
    const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const monthDay = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    const logs = (0, journal_1.getJournal)();
    const reactions = (0, reactions_1.getReactions)();
    const firstSeen = getFirstSeenMap();
    const isInRange = (logDate, startDate, endDate) => {
        return logDate >= dateStr(startDate) && logDate <= dateStr(endDate);
    };
    const thisWeekLogs = logs.filter(l => isInRange(l.date, thisWeekStart, today));
    const thisWeekReactions = reactions.filter(r => {
        const d = r.occurredAt.slice(0, 10);
        return d >= dateStr(thisWeekStart) && d <= dateStr(today);
    });
    const loveCount = thisWeekLogs.filter(l => l.preference === 'love').length;
    const newFoods = new Set();
    for (const log of thisWeekLogs) {
        for (const ing of log.ingredients || []) {
            if (isFoodNew(ing, log, firstSeen, profile) && isInRange(log.date, thisWeekStart, today)) {
                newFoods.add(ing);
            }
        }
    }
    const newFoodCount = newFoods.size;
    const reactionCount = thisWeekReactions.length;
    const todayMs = today.getTime();
    const eligibleDims = profile
        ? NUTRITION_DIMS.filter(d => d.cats.some(c => profile.categoryAllergies[c]?.state === 'open'))
        : NUTRITION_DIMS;
    const dimScores = eligibleDims.map(d => ({
        ...d,
        daysSince: daysSinceLastInCats(logs, d.cats, todayMs)
    })).sort((a, b) => b.daysSince - a.daysSince);
    const topDim = dimScores[0] || { key: 'greenVeg', label: '未吃绿叶菜', emoji: '🌿', daysSince: 0 };
    const lastWeekLogs = logs.filter(l => isInRange(l.date, lastWeekStart, lastWeekEnd));
    const lastWeekReactions = reactions.filter(r => {
        const d = r.occurredAt.slice(0, 10);
        return d >= dateStr(lastWeekStart) && d <= dateStr(lastWeekEnd);
    });
    const lastLove = lastWeekLogs.filter(l => l.preference === 'love').length;
    const lastNewFoods = new Set();
    for (const log of lastWeekLogs) {
        for (const ing of log.ingredients || []) {
            if (firstSeen.get(ing) === log.date)
                lastNewFoods.add(ing);
        }
    }
    const lastReactions = lastWeekReactions.length;
    let nutritionHint = '';
    let nutritionState = 'normal';
    if (topDim.daysSince === 0) {
        nutritionHint = '今日吃过 ✓';
        nutritionState = 'ok';
    }
    else if (topDim.daysSince === 1) {
        nutritionHint = '昨日吃过 ✓';
        nutritionState = 'ok';
    }
    else if (topDim.daysSince >= 3) {
        nutritionHint = '建议关注';
        nutritionState = 'warn';
    }
    return {
        range: { from: dateStr(thisWeekStart), to: dateStr(today) },
        rangeLabel: `${monthDay(thisWeekStart)} - ${monthDay(today)}`,
        loveCount,
        loveDelta: loveCount - lastLove,
        newFoodCount,
        newFoodDelta: newFoodCount - lastNewFoods.size,
        reactionCount,
        reactionDelta: reactionCount - lastReactions,
        nutritionDays: topDim.daysSince,
        nutritionLabel: topDim.label,
        nutritionEmoji: topDim.emoji,
        nutritionHint,
        nutritionState
    };
}
function formatDelta(delta) {
    if (delta === 0)
        return '比上周持平';
    if (delta > 0)
        return `比上周 +${delta}`;
    return `比上周 ${delta}`;
}
function buildTimeline(logs, reactions) {
    const events = [];
    for (const log of logs) {
        const t = new Date((0, journal_1.getMealTime)(log));
        events.push({
            type: 'meal',
            date: log.date,
            timeLabel: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
            timestampMs: t.getTime(),
            payload: log
        });
    }
    for (const r of reactions) {
        const t = new Date(r.occurredAt);
        events.push({
            type: 'reaction',
            date: r.occurredAt.slice(0, 10),
            timeLabel: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
            timestampMs: t.getTime(),
            payload: r
        });
    }
    events.sort((a, b) => {
        if (a.date !== b.date)
            return b.date.localeCompare(a.date);
        return a.timestampMs - b.timestampMs;
    });
    return events;
}
