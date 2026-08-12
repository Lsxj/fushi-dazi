"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const planner_1 = require("../../utils/planner");
const storage_1 = require("../../utils/storage");
const storage_2 = require("../../utils/storage");
const ingredients_1 = require("../../data/ingredients");
const journal_1 = require("../../utils/journal");
const categories_1 = require("../../data/categories");
const checkin_1 = require("../../utils/checkin");
const reactions_1 = require("../../utils/reactions");
const observation_1 = require("../../utils/observation");
const dateUtil_1 = require("../../utils/dateUtil");
const POST_VACCINE_DAYS = 3;
const RECENT_REACTION_HOURS = 24;
function syncPlanForTrying(profile) {
    const existingPlan = wx.getStorageSync('weeklyPlan') || [];
    if (existingPlan.length > 0) {
        const newPlan = (0, planner_1.regenerateKeepingLoggedToday)(profile, existingPlan);
        wx.setStorageSync('weeklyPlan', newPlan);
    }
}
function detectNewFoodsForTrying(profile, ingredients) {
    const confirmed = new Set(profile.confirmedFoods || []);
    const result = [];
    const seen = new Set();
    for (const ing of ingredients) {
        if (seen.has(ing))
            continue;
        seen.add(ing);
        if (confirmed.has(ing))
            continue;
        const ex = profile.individualExceptions[ing];
        if (ex)
            continue;
        const parent = (0, categories_1.getParentFood)(ing);
        if (parent && confirmed.has(parent))
            continue;
        const cat = (0, categories_1.getCategoryByFood)(ing);
        if (!cat)
            continue;
        const catState = profile.categoryAllergies[cat.id];
        if (catState?.state === 'trying')
            continue;
        if (catState?.state === 'open' && catState.tryingFood === ing)
            continue;
        result.push(ing);
    }
    return result;
}
function snapshotTryingProgress() {
    const p = wx.getStorageSync('babyProfile');
    return p ? (0, planner_1.getTryingProgress)(p) : null;
}
function toastWithTryingDelta(before, defaultTitle, defaultDuration = 800) {
    const p = wx.getStorageSync('babyProfile');
    if (p && (0, planner_1.reconcileTryingReplaced)(p)) {
        wx.setStorageSync('babyProfile', p);
    }
    const after = p ? (0, planner_1.getTryingProgress)(p) : null;
    let note = '';
    if (after && before && after.food === before.food) {
        if (after.dayIndex > before.dayIndex || before.daysRequired > after.daysRequired) {
            note = ` · 第 ${after.dayIndex}/${after.daysRequired} 天`;
        }
    }
    wx.showToast({
        title: defaultTitle + note,
        icon: note ? 'none' : 'success',
        duration: note ? 1800 : defaultDuration
    });
}
const STAPLE_NAMES = new Set(['大米', '小米', '面条', '米粉', '燕麦', '麦片']);
const INGREDIENT_EMOJI = {
    '猪肉': '🥩', '牛肉': '🥩', '羊肉': '🥩',
    '鸡肉': '🍗', '鸡胸肉': '🍗', '鸭肉': '🍗',
    '鱼肉': '🐟', '三文鱼': '🐟', '鳕鱼': '🐟', '虾': '🦐',
    '鸡蛋': '🥚', '蛋黄': '🥚',
    '猪肝': '🫀', '鸡肝': '🫀',
    '胡萝卜': '🥕',
    '菠菜': '🥬', '娃娃菜': '🥬', '白菜': '🥬', '油菜': '🥬', '生菜': '🥬', '青菜': '🥬',
    '西兰花': '🥦', '芥蓝': '🥦',
    '南瓜': '🎃', '红薯': '🍠', '土豆': '🥔', '山药': '🥔',
    '苹果': '🍎', '香蕉': '🍌', '梨': '🍐', '蓝莓': '🫐', '草莓': '🍓', '橙子': '🍊',
    '大米': '🍚', '小米': '🌾', '面条': '🍜', '米粉': '🍚',
    '豆腐': '🟦', '酸奶': '🥛', '奶酪': '🧀'
};
function emojiFor(name) {
    return INGREDIENT_EMOJI[name] || '🍽️';
}
function pickMainIngredient(ingredients) {
    const main = ingredients.find(i => !STAPLE_NAMES.has(i.name)) || ingredients[0];
    return { name: main.name, emoji: emojiFor(main.name) };
}
function daysSincePurchase(item) {
    if (!item.purchaseDate)
        return 0;
    const diff = ((0, dateUtil_1.todayLocalStartMs)() - (0, dateUtil_1.parseLocalDateMs)(item.purchaseDate)) / 86400000;
    return Math.max(0, Math.floor(diff));
}
function daysUntilExpiry(item) {
    if (!item.expiryDate)
        return 0;
    const diff = ((0, dateUtil_1.parseLocalDateMs)(item.expiryDate) - (0, dateUtil_1.todayLocalStartMs)()) / 86400000;
    return Math.max(0, Math.floor(diff));
}
function rebuildPlan(profile) {
    const existing = wx.getStorageSync('weeklyPlan') || [];
    const newPlan = (0, planner_1.regenerateKeepingLoggedToday)(profile, existing);
    wx.setStorageSync('weeklyPlan', newPlan);
}
function formatTime(iso) {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}
Page({
    data: {
        babyName: '',
        birthday: '',
        today: '',
        ageMonths: 0,
        mealsPerDay: 0,
        editing: { name: false },
        todayDateLabel: '',
        tomorrowDateLabel: '',
        todayMeals: [],
        tomorrowMeals: [],
        todayCompleted: 0,
        todayProgressPct: 0,
        statusBarHeight: 0,
        navBarHeight: 88,
        tomorrowExpanded: false,
        tomorrowSummary: '',
        statusSheetVisible: false,
        currentStatus: 'normal',
        statusVaccineHint: '',
        statusReactionBanner: '',
        pills: [],
        reactionCard: null,
        reactionPromo: null,
        todayReactionEntry: '',
        mealsTipText: '',
        todayAdvice: null,
        moreRecsSheetOpen: false,
        moreRecsList: [],
        tomorrowPrepText: '',
        emptyDiagnosis: null,
        recommendations: [],
        recExpanded: false,
        recentReactions: 0,
        dueRetry: [],
        trying: null,
        manualOpen: false,
        manualIsEditing: false,
        manualEditDate: '',
        manualEditMealIndex: -1,
        manualDate: '',
        manualTime: '',
        manualDishName: '',
        manualIngChips: [],
        manualIngInput: '',
        manualIngSuggestions: [],
        manualPortion: '',
        manualNote: '',
        todayStr: '',
        replaceSheetOpen: false,
        replaceCandidates: [],
        replaceSwapTargets: [],
        replaceAltsExpanded: false,
        replaceCtx: null,
        actualSheetOpen: false,
        actualSheetCtx: null,
        actualTime: '',
        actualDetailsOpen: false,
        actualDishName: '',
        actualIngredients: [],
        actualIngredientChips: [],
        actualPortion: '',
        actualNote: ''
    },
    onLoad() {
        try {
            const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            const menu = wx.getMenuButtonBoundingClientRect();
            const statusBarHeight = sys.statusBarHeight || 20;
            const navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height;
            this.setData({ statusBarHeight, navBarHeight });
        }
        catch (e) {
            this.setData({ statusBarHeight: 20, navBarHeight: 44 });
        }
    },
    onShow() {
        const setupDone = wx.getStorageSync('setupDone');
        const profile = wx.getStorageSync('babyProfile');
        if (!setupDone || !profile) {
            wx.reLaunch({ url: '/pages/welcome/welcome' });
            return;
        }
        this.refresh();
    },
    refresh() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        if ((0, planner_1.reconcileTryingReplaced)(profile)) {
            wx.setStorageSync('babyProfile', profile);
        }
        if ((0, planner_1.reconcileExceptions)(profile)) {
            wx.setStorageSync('babyProfile', profile);
        }
        let ageMonths = profile.ageMonths;
        if (profile.birthday) {
            ageMonths = (0, planner_1.calcAgeMonths)(profile.birthday);
            if (ageMonths !== profile.ageMonths) {
                profile.ageMonths = ageMonths;
                wx.setStorageSync('babyProfile', profile);
            }
        }
        if (profile.currentStatus === 'postVaccine' && profile.statusSince) {
            const days = ((0, dateUtil_1.todayLocalStartMs)() - (0, dateUtil_1.parseLocalDateMs)(profile.statusSince)) / 86400000;
            if (days >= POST_VACCINE_DAYS) {
                profile.currentStatus = 'normal';
                profile.statusSince = undefined;
                wx.setStorageSync('babyProfile', profile);
                rebuildPlan(profile);
            }
        }
        const completed = (0, planner_1.checkTryingComplete)(profile);
        if (completed) {
            const updated = (0, planner_1.completeTrying)(profile, completed.categoryId);
            wx.setStorageSync('babyProfile', updated);
            rebuildPlan(updated);
            wx.showToast({ title: `${completed.food} 排敏完成,已加入安全清单`, icon: 'none', duration: 2200 });
        }
        const introduceDone = (0, observation_1.checkIntroducingComplete)(profile);
        if (introduceDone.length > 0) {
            let p = profile;
            for (const food of introduceDone) {
                p = (0, observation_1.completeIntroducing)(p, food);
            }
            wx.setStorageSync('babyProfile', p);
            rebuildPlan(p);
            wx.showToast({ title: `${introduceDone.join('、')} 引入完成,已加入安全清单`, icon: 'none', duration: 2400 });
        }
        let plan = wx.getStorageSync('weeklyPlan') || [];
        if (!plan || plan.length === 0) {
            plan = (0, planner_1.generateWeeklyPlan)(profile, 7);
            wx.setStorageSync('weeklyPlan', plan);
        }
        const today = (0, planner_1.formatDate)(new Date());
        const tomorrow = (0, planner_1.formatDate)(new Date(Date.now() + 86400000));
        const tryingFoodCheck = (0, planner_1.getTryingFood)(profile);
        if (tryingFoodCheck) {
            const progressCheck = (0, planner_1.getTryingProgress)(profile);
            const scheduledCheck = (0, planner_1.getTryingScheduledStart)(profile);
            const targetDate = progressCheck ? today : (scheduledCheck ? tomorrow : '');
            if (targetDate) {
                const targetPlan = plan.find(p => p.date === targetDate);
                if (targetPlan) {
                    const journalCheck = wx.getStorageSync('mealJournal') || [];
                    const loggedIdxCheck = new Set(journalCheck.filter(l => l.date === targetDate).map(l => l.mealIndex));
                    const hasIt = targetPlan.meals.some(m => m.recipe.ingredients.some(i => i.name === tryingFoodCheck) ||
                        m.trialIngredient === tryingFoodCheck);
                    const hasUnlogged = targetPlan.meals.some(m => !loggedIdxCheck.has(m.mealIndex));
                    const tryingCatId = (0, planner_1.getCurrentTryingCategoryId)(profile);
                    const replacedDates = tryingCatId ? (profile.categoryAllergies[tryingCatId]?.tryingReplacedDates || []) : [];
                    const userActivelyReplaced = replacedDates.includes(targetDate);
                    if (!hasIt && hasUnlogged && !userActivelyReplaced) {
                        rebuildPlan(profile);
                        plan = wx.getStorageSync('weeklyPlan') || [];
                    }
                }
            }
        }
        const todayDay = plan.find(p => p.date === today);
        const tomorrowDay = plan.find(p => p.date === tomorrow);
        const tomorrowMealsRaw = tomorrowDay?.meals || [];
        const allReactions = (0, reactions_1.getReactions)();
        const now = Date.now();
        const recentReactions24h = allReactions.filter(r => !r.resolvedAt && now - new Date(r.occurredAt).getTime() < RECENT_REACTION_HOURS * 3600 * 1000);
        const reactions72h = allReactions.filter(r => !r.resolvedAt && now - new Date(r.occurredAt).getTime() < 72 * 3600 * 1000);
        const todayReactions = allReactions.filter(r => !r.resolvedAt && r.occurredAt.slice(0, 10) === today);
        const reactionMealKeys = new Set();
        for (const r of allReactions) {
            for (const tm of r.tracebackMeals) {
                reactionMealKeys.add(`${tm.date}-${tm.mealIndex}`);
            }
        }
        const todayMealsEnriched = (todayDay?.meals || []).slice()
            .sort((a, b) => a.mealIndex - b.mealIndex)
            .map(m => {
            const log = (0, journal_1.getMealLog)(today, m.mealIndex);
            const pref = log?.preference;
            const planName = m.recipe.name;
            const planIngredientsText = m.recipe.ingredients.map(i => `${i.name}${i.portions}份`).join(' + ');
            let headlineName = '';
            let detailText = '';
            let planHint = '';
            if (!log) {
                headlineName = `计划：${planName}`;
                detailText = planIngredientsText;
            }
            else if (log.isCustom) {
                const ings = log.ingredients || [];
                const MAX_DISPLAY = 4;
                const visible = ings.slice(0, MAX_DISPLAY).join('、');
                const actualIngText = ings.length > MAX_DISPLAY
                    ? `${visible} 等 ${ings.length} 种`
                    : visible;
                const headlineFallback = ings.length > 2
                    ? `${ings.slice(0, 2).join('、')} 等 ${ings.length} 种`
                    : visible;
                headlineName = log.customDishName || headlineFallback || planName;
                detailText = log.customDishName ? actualIngText : '';
                planHint = `计划：${planName}`;
            }
            else {
                headlineName = planName;
                detailText = planIngredientsText;
            }
            const logPortion = log?.portion;
            const portionLabel = logPortion ? `${journal_1.PORTION_EMOJI[logPortion]} ${journal_1.PORTION_LABEL[logPortion]}` : '';
            return {
                ...m,
                logged: !!log,
                linkedReaction: reactionMealKeys.has(`${today}-${m.mealIndex}`),
                ingredientsText: planIngredientsText,
                preference: pref || '',
                preferenceLabel: pref ? `${journal_1.PREFERENCE_EMOJI[pref]} ${journal_1.PREFERENCE_LABEL[pref]}` : '',
                portionLabel,
                isCustomLog: !!log?.isCustom,
                headlineName,
                detailText,
                planHint,
                displayOrder: m.mealIndex + 1
            };
        });
        const tomorrowMealsEnriched = tomorrowMealsRaw.map(m => {
            const main = pickMainIngredient(m.recipe.ingredients);
            return {
                ...m,
                ingredientsText: m.recipe.ingredients.map(i => i.name).join(' + '),
                mainEmoji: main.emoji,
                mainName: main.name
            };
        });
        const tomorrowSummary = tomorrowMealsEnriched.length > 0
            ? `${tomorrowMealsEnriched.length} 顿 · ${tomorrowMealsEnriched.map(m => m.recipe.name).join(' / ')}`
            : '';
        const todayCompleted = todayMealsEnriched.filter(m => m.logged).length;
        const todayProgressPct = todayMealsEnriched.length > 0
            ? Math.round((todayCompleted / todayMealsEnriched.length) * 100)
            : 0;
        const todayPrep = this.computePrepForDate(tomorrowMealsRaw);
        const nearExpiry = (0, storage_2.getNearExpiry)(2);
        const recs = (0, planner_1.getNextRecommendation)(profile).map(r => ({
            categoryId: r.categoryId,
            category: r.category,
            reason: r.reason,
            foods: r.suggestedFoods,
            firstFood: r.firstFood,
            mode: r.mode,
            daysRequired: r.daysRequired
        }));
        const pills = [];
        if (recentReactions24h.length > 0) {
            pills.push({ label: '⚠️ 需观察', kind: 'needObs' });
        }
        if ((0, planner_1.hasActiveGutReaction)() && recentReactions24h.length === 0) {
            pills.push({ label: '🤒 肠胃恢复中', kind: 'gut' });
        }
        if (profile.currentStatus === 'postVaccine' && profile.statusSince) {
            const daysIn = Math.floor((now - (0, dateUtil_1.parseLocalDateMs)(profile.statusSince)) / 86400000) + 1;
            pills.push({ label: `🛡️ 疫苗后第${daysIn}天`, kind: 'postVaccine' });
        }
        if (pills.length === 0) {
            pills.push({ label: '✓ 正常', kind: 'normal' });
        }
        let statusReactionBanner = '';
        if (recentReactions24h.length > 0) {
            statusReactionBanner = '当前是「需观察」——反应未消退导致的。在记录页标记反应已消退后会自动清除。';
        }
        else if ((0, planner_1.hasActiveGutReaction)()) {
            statusReactionBanner = '当前是「肠胃恢复中」——肠胃反应未消退。在记录页标记反应已消退后会自动清除。';
        }
        let reactionCard = null;
        let reactionPromo = null;
        let todayReactionEntry = '';
        let mealsTipText = '';
        if (reactions72h.length > 0) {
            const SEV_RANK = { severe: 3, moderate: 2, mild: 1 };
            const sorted = [...reactions72h].sort((a, b) => (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0) ||
                b.occurredAt.localeCompare(a.occurredAt));
            const top = sorted[0];
            const topDate = top.occurredAt.slice(0, 10);
            const tLabel = topDate === today ? formatTime(top.occurredAt) : `${topDate.slice(5)} ${formatTime(top.occurredAt)}`;
            const sevLabel = reactions_1.SEVERITY_LABEL[top.severity];
            const typeLabel = reactions_1.REACTION_TYPE_LABEL[top.type];
            const note = top.note ? top.note : `${sevLabel}${typeLabel}`;
            reactionCard = {
                count: reactions72h.length,
                latestNote: note,
                latestTime: tLabel
            };
            todayReactionEntry = `近72h已记录${reactions72h.length}次`;
            mealsTipText = '已根据不适记录回溯近 72h 食材，建议继续观察后续反馈哦~';
        }
        else {
            reactionPromo = {
                title: '宝宝不舒服？立即记一笔',
                desc: '搭子回溯近72h喂养，揪出可疑食材'
            };
            if (todayCompleted < todayMealsEnriched.length) {
                mealsTipText = '喂完顺手点个「饭后反馈」，下次菜单更懂宝宝～';
            }
        }
        const todayNutritionCovered = new Set();
        for (const m of todayMealsEnriched) {
            if (m.recipe && m.recipe.mealCategories) {
                m.recipe.mealCategories.forEach((c) => todayNutritionCovered.add(c));
            }
        }
        const requiredNutri = ['staple', 'protein', 'veg'];
        const labelMap = { staple: '主食', protein: '蛋白', veg: '蔬菜', fruit: '水果' };
        const missing = requiredNutri.filter(c => !todayNutritionCovered.has(c));
        const todayAdvice = this.computeTodayAdvice({
            profile,
            todayReactions,
            recentReactions24h,
            recs,
            nearExpiry,
            tryingProgress: (0, planner_1.getTryingProgress)(profile),
            nutritionMissing: missing.map(c => labelMap[c]),
            todayAllFed: todayCompleted >= todayMealsEnriched.length && todayMealsEnriched.length > 0,
            tomorrowHasTrying: tomorrowMealsEnriched.some((m) => {
                const tf = (0, planner_1.getTryingFood)(profile);
                return tf && m.recipe.ingredients.some((i) => i.name === tf);
            })
        });
        let tomorrowPrepText = '';
        if (todayPrep.length > 0) {
            const top = todayPrep[0];
            tomorrowPrepText = `今晚记得：${top.action}${top.ingredient}～`;
            if (mealsTipText) {
                tomorrowPrepText += '，明日先保持熟悉食材，更稳妥';
            }
        }
        const tryingProgress = (0, planner_1.getTryingProgress)(profile);
        const tryingVM = tryingProgress ? {
            food: tryingProgress.food,
            categoryId: tryingProgress.categoryId,
            dayIndex: tryingProgress.dayIndex,
            daysRequired: tryingProgress.daysRequired,
            replacedCount: (profile.categoryAllergies[tryingProgress.categoryId].tryingReplacedDates || []).length
        } : null;
        const dueList = (0, observation_1.getDueRetryFoods)(profile).map(item => {
            const days = item.ex.enteredAt
                ? Math.floor((now - (0, dateUtil_1.parseLocalDateMs)(item.ex.enteredAt)) / 86400000)
                : 7;
            return { name: item.name, daysObs: days };
        });
        let statusVaccineHint = '';
        if (profile.currentStatus === 'postVaccine' && profile.statusSince) {
            const daysIn = Math.floor((now - (0, dateUtil_1.parseLocalDateMs)(profile.statusSince)) / 86400000) + 1;
            const remain = Math.max(0, POST_VACCINE_DAYS - daysIn + 1);
            statusVaccineHint = `第${daysIn}天，剩余${remain}天自动恢复`;
        }
        this.setData({
            babyName: profile.babyName,
            birthday: profile.birthday || '',
            today,
            ageMonths,
            mealsPerDay: profile.mealsPerDay,
            currentStatus: profile.currentStatus || 'normal',
            statusVaccineHint,
            statusReactionBanner,
            emptyDiagnosis: (todayMealsEnriched.length === 0 && tomorrowMealsEnriched.length === 0) ? (0, planner_1.diagnoseEmptyPlan)(profile) : null,
            todayMeals: todayMealsEnriched,
            tomorrowMeals: tomorrowMealsEnriched,
            tomorrowSummary,
            todayCompleted,
            todayProgressPct,
            todayDateLabel: this.todayDateLabelFormat(today),
            tomorrowDateLabel: this.todayDateLabelFormat(tomorrow),
            pills,
            reactionCard,
            reactionPromo,
            todayReactionEntry,
            mealsTipText,
            todayAdvice,
            tomorrowPrepText,
            recommendations: recs,
            recentReactions: recentReactions24h.length,
            dueRetry: dueList,
            trying: tryingVM
        });
    },
    todayDateLabelFormat(dateStr) {
        const parts = dateStr.slice(0, 10).split('-').map(Number);
        const d = parts.length === 3 && !parts.some(isNaN)
            ? new Date(parts[0], parts[1] - 1, parts[2])
            : new Date(dateStr);
        const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
        return `${dateStr.split('-')[1]}/${dateStr.split('-')[2]} ${week}`;
    },
    computeTodayAdvice(ctx) {
        const { profile, todayReactions, recs, nearExpiry, tryingProgress, nutritionMissing = [], todayAllFed = false, tomorrowHasTrying = false } = ctx;
        const chips = [];
        const expiryChip = (f) => {
            const dpast = daysSincePurchase(f);
            const icon = emojiFor(f.name);
            if (dpast >= 2) {
                return { icon, text: `${f.name}已放${dpast}天，建议优先吃` };
            }
            return { icon, text: `${f.name}还能放${daysUntilExpiry(f)}天` };
        };
        if (todayReactions.length > 0) {
            const top = todayReactions[0];
            const sym = top.note || `${reactions_1.SEVERITY_LABEL[top.severity]}${reactions_1.REACTION_TYPE_LABEL[top.type]}`;
            chips.push({ icon: '📋', text: '已回溯近72h食材' }, { icon: '🌱', text: '明日先吃熟悉食材' });
            if (nearExpiry.length > 0)
                chips.push(expiryChip(nearExpiry[0]));
            return {
                title: `记到 ${todayReactions.length} 次${sym}，今天先稳一稳`,
                desc: '继续吃熟悉的食材观察一下；明天先不加新食材，更稳妥。',
                chips,
                ctaPrimary: { label: '看看吃了啥', action: 'viewReactions' },
                ctaSecondary: null
            };
        }
        if (profile.currentStatus === 'postVaccine' && profile.statusSince) {
            const daysIn = Math.floor(((0, dateUtil_1.todayLocalStartMs)() - (0, dateUtil_1.parseLocalDateMs)(profile.statusSince)) / 86400000) + 1;
            const remain = Math.max(0, POST_VACCINE_DAYS - daysIn + 1);
            chips.push({ icon: '🛡️', text: '今天先吃熟悉食材' }, { icon: '📅', text: remain > 0 ? `${remain}天后恢复新引入` : '明天可恢复新引入' });
            if (nearExpiry.length > 0)
                chips.push(expiryChip(nearExpiry[0]));
            return {
                title: `疫苗后第 ${daysIn} 天，先吃熟食材`,
                desc: '疫苗期不加新食材，3 天后自动回到正常节奏。',
                chips,
                ctaPrimary: { label: '提前结束保护期', action: 'endProtection' },
                ctaSecondary: null
            };
        }
        const tryingScheduled = (0, planner_1.getTryingScheduledStart)(profile);
        if (tryingScheduled && !tryingProgress) {
            const scheduledCat = profile.categoryAllergies[tryingScheduled.categoryId];
            const scheduledDays = scheduledCat?.tryingDaysRequired || 3;
            const isInCategoryAdd = scheduledCat?.representative && scheduledCat.representative !== tryingScheduled.food;
            chips.push({ icon: '📅', text: `明日第 1/${scheduledDays} 天` }, { icon: '🌱', text: `明日餐次会含${tryingScheduled.food}` });
            if (nearExpiry.length > 0)
                chips.push(expiryChip(nearExpiry[0]));
            const passLabel = isInCategoryAdd ? `加入安全清单` : '开放整类';
            return {
                title: `${tryingScheduled.food} 排敏，明日开始`,
                desc: `今日已喂完，从明天起观察 ${scheduledDays} 天没反应就${passLabel}。明日预告 ↓ 已自动安排 ${tryingScheduled.food}。`,
                chips,
                ctaPrimary: { label: '取消排敏', action: 'abortTrying' },
                ctaSecondary: null
            };
        }
        if (tryingProgress) {
            const tryingCat = profile.categoryAllergies[tryingProgress.categoryId];
            const dayIndex = tryingProgress.dayIndex;
            const daysRequired = tryingProgress.daysRequired;
            const remainDays = Math.max(0, daysRequired - dayIndex);
            const replacedCount = (tryingCat.tryingReplacedDates || []).length;
            const isInCategoryAdd = !!tryingCat.representative && tryingCat.representative !== tryingProgress.food;
            const food = tryingProgress.food;
            const passLabel = isInCategoryAdd ? `加入安全清单` : '开放整类';
            const isComplete = dayIndex >= daysRequired;
            const isWaitingFirstFeed = dayIndex === 0;
            const todayMissed = isWaitingFirstFeed && todayAllFed;
            let title = '';
            let desc = '';
            if (isComplete) {
                title = `${food} 排敏期已满`;
                desc = `已实际喂过 ${daysRequired} 天没反应，可以确认${passLabel}。`;
                chips.push({ icon: '✓', text: '观察期已满，可确认' });
            }
            else if (todayMissed) {
                title = `${food} 排敏中（今日错过）`;
                desc = tomorrowHasTrying
                    ? `今天所有餐都喂完了，但都没含 ${food}。明日菜单已自动安排，记得给宝宝尝一次。`
                    : `今天所有餐都喂完了，但都没含 ${food}。建议明天的菜单加上含 ${food} 的一餐。`;
                chips.push({ icon: '🌅', text: tomorrowHasTrying ? `明天会喂 ${food}` : `去计划页给明天加上 ${food}` });
            }
            else if (isWaitingFirstFeed) {
                title = `${food} 排敏中（今日待喂）`;
                desc = `还没喂过 ${food}。第一次吃后开始计观察期，观察 ${daysRequired} 天没反应就${passLabel}。`;
                chips.push({ icon: '🍽', text: `今天先喂一次 ${food}` });
            }
            else {
                title = `${food} 排敏中 (第 ${dayIndex} / ${daysRequired} 天)`;
                desc = `观察 ${daysRequired} 天没反应就${passLabel}。期间按现有食材搭配，明日维持熟悉组合。`;
                chips.push({ icon: '🔍', text: `再观察${remainDays}天就通过` });
                chips.push({ icon: '🌱', text: '明日维持熟悉组合' });
            }
            if (replacedCount > 0 && !isComplete && !todayMissed) {
                chips.push({ icon: '🔁', text: `期间已替换 ${replacedCount} 顿（已计入）` });
            }
            if (nearExpiry.length > 0)
                chips.push(expiryChip(nearExpiry[0]));
            return {
                title,
                desc,
                chips,
                ctaPrimary: isComplete ? { label: '确认安全', action: 'confirmTrying' } : { label: '提前确认安全', action: 'confirmTrying' },
                ctaSecondary: { label: '停止排敏', action: 'abortTrying' }
            };
        }
        if ((0, planner_1.hasActiveGutReaction)()) {
            chips.push({ icon: '🍵', text: '先吃稳定食物，避开海鲜/高纤维' }, { icon: '🌿', text: '反应消退后自动恢复推荐' });
            return {
                title: '肠胃在恢复，先吃稳的',
                desc: '海鲜和高纤维已经帮你避开了，等好了自动回正常推荐。',
                chips,
                ctaPrimary: { label: '宝宝已经好了', action: 'endProtection' },
                ctaSecondary: null
            };
        }
        if ((0, planner_1.hasActiveConstipation)()) {
            chips.push({ icon: '🥒', text: '多吃西梅/火龙果/燕麦/紫薯' }, { icon: '💧', text: '每餐间补充温水' }, { icon: '🚫', text: '避开精米米糊/低纤维主食' });
            return {
                title: '便秘恢复中，加点纤维和水',
                desc: '西梅含山梨醇是儿科推荐金标准；火龙果籽促肠动；燕麦/紫薯/熟透香蕉都能帮忙。',
                chips,
                ctaPrimary: { label: '宝宝已经好了', action: 'endProtection' },
                ctaSecondary: null
            };
        }
        if (recs.length > 0) {
            const top = recs[0];
            const isInCategory = top.mode === 'newFoodInOpenCategory';
            const daysLabel = `${top.daysRequired}天观察`;
            chips.push({ icon: isInCategory ? '🔁' : '✨', text: isInCategory ? `${top.category}里再补一个` : `${top.category}可以排敏了` }, { icon: emojiFor(top.foods[0] || top.firstFood || ''), text: `推荐${top.foods.slice(0, 2).join('、')}` }, { icon: '📅', text: daysLabel });
            if (nearExpiry.length > 0)
                chips.push(expiryChip(nearExpiry[0]));
            const title = isInCategory
                ? `${top.category}里再加一个：${top.firstFood}`
                : `可尝试引入${top.category}`;
            const desc = isInCategory
                ? `${top.foods.slice(0, 3).join('、')} 仍是新的食物，需要逐种观察至少 3 天。`
                : `${top.foods.slice(0, 3).join('、')} 适合今天先排敏，从代表食物开始。`;
            return {
                title,
                desc,
                chips,
                ctaPrimary: {
                    label: `开始排敏 ${top.firstFood}`,
                    action: 'startTrying',
                    catId: top.categoryId,
                    food: top.firstFood,
                    daysRequired: top.daysRequired
                },
                ctaSecondary: null,
                moreRecsCount: recs.length - 1
            };
        }
        if (nutritionMissing.length === 0) {
            chips.push({ icon: '🥗', text: '主食·蛋白·蔬菜都齐了' });
        }
        else {
            chips.push({ icon: '💚', text: `今天还差${nutritionMissing.join('·')}` });
        }
        const fridge = wx.getStorageSync('fridge') || [];
        if (nearExpiry.length > 0) {
            chips.push(expiryChip(nearExpiry[0]));
        }
        else if (fridge.length === 0) {
            chips.push({ icon: '🛒', text: '冰箱已空，记得补货' });
        }
        else if (fridge.length >= 5) {
            chips.push({ icon: '🧊', text: `冰箱有 ${fridge.length} 种食材` });
        }
        else {
            chips.push({ icon: '🧊', text: `冰箱 ${fridge.length} 种，可补充` });
        }
        const title = nutritionMissing.length === 0 ? '今天搭得很均衡' : `今天差点${nutritionMissing.join('和')}`;
        const desc = nutritionMissing.length === 0
            ? '继续这个节奏就好，等熟悉了再考虑引入新食材。'
            : `两餐合起来还差${nutritionMissing.join('、')}，明天的菜单可以补一下。`;
        return {
            title,
            desc,
            chips,
            ctaPrimary: { label: '看看明日菜单', action: 'viewTomorrow' },
            ctaSecondary: null
        };
    },
    computePrepForDate(meals) {
        const totalPortions = new Map();
        for (const meal of meals) {
            for (const ing of meal.recipe.ingredients) {
                totalPortions.set(ing.name, (totalPortions.get(ing.name) || 0) + ing.portions);
            }
        }
        const prepMap = new Map();
        for (const [name, portions] of totalPortions.entries()) {
            const ingDef = (0, ingredients_1.getIngredient)(name);
            if (!ingDef)
                continue;
            for (const step of ingDef.prepSteps) {
                if (step.hoursAhead >= 8) {
                    const key = `${name}-${step.type}`;
                    const portionsLabel = portions > 1 ? `(${portions}份)` : '';
                    if (!prepMap.has(key)) {
                        prepMap.set(key, {
                            ingredient: name + portionsLabel,
                            action: step.description
                        });
                    }
                }
            }
        }
        return Array.from(prepMap.entries()).map(([key, v]) => ({ key, ...v }));
    },
    askPreference(e) {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        const today = this.data.today;
        wx.showActionSheet({
            itemList: ['😋 爱吃', '😐 不爱吃', '清除标记'],
            success: (res) => {
                const choice = res.tapIndex === 0 ? 'love' : res.tapIndex === 1 ? 'dislike' : null;
                (0, journal_1.setPreference)(today, idx, choice);
                wx.showToast({ title: choice ? `已记录${journal_1.PREFERENCE_LABEL[choice]}` : '已清除', icon: 'none', duration: 800 });
                this.refresh();
            }
        });
    },
    doCheckin(e) {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        const meal = this.data.todayMeals.find(m => m.mealIndex === idx);
        if (!meal)
            return;
        const before = snapshotTryingProgress();
        (0, checkin_1.checkinMeal)(this.data.today, idx, meal.recipe);
        toastWithTryingDelta(before, '已扣库存', 600);
        this.refresh();
    },
    computeIngSuggestions(excludeChips) {
        const logs = (0, journal_1.getJournal)();
        const cutoff = Date.now() - 30 * 86400000;
        const counter = {};
        for (const l of logs) {
            const t = (0, journal_1.getMealTime)(l) ? new Date((0, journal_1.getMealTime)(l)).getTime() : 0;
            if (t < cutoff)
                continue;
            for (const ing of (l.ingredients || [])) {
                if (!ing)
                    continue;
                counter[ing] = (counter[ing] || 0) + 1;
            }
        }
        const excludeSet = new Set(excludeChips);
        return Object.entries(counter)
            .filter(([name]) => !excludeSet.has(name))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name]) => name);
    },
    addMealManual() {
        const now = new Date();
        const today = (0, planner_1.formatDate)(now);
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        this.setData({
            manualOpen: true,
            manualIsEditing: false,
            manualEditDate: '',
            manualEditMealIndex: -1,
            manualDate: today,
            todayStr: today,
            manualTime: `${hh}:${mm}`,
            manualDishName: '',
            manualIngChips: [],
            manualIngInput: '',
            manualIngSuggestions: this.computeIngSuggestions([]),
            manualPortion: '',
            manualNote: ''
        });
    },
    closeManualSheet() {
        this.setData({ manualOpen: false, manualIsEditing: false });
    },
    onManualDateChange(e) {
        this.setData({ manualDate: e.detail.value });
    },
    onManualTimeChange(e) {
        this.setData({ manualTime: e.detail.value });
    },
    onManualDishInput(e) {
        this.setData({ manualDishName: e.detail.value });
    },
    onManualIngsInput(e) {
        this.setData({ manualIngInput: e.detail.value });
    },
    onManualIngsConfirm() {
        this.addIngChipFromInput();
    },
    addIngChipFromInput() {
        const raw = (this.data.manualIngInput || '').trim();
        if (!raw)
            return;
        const parts = raw.split(/[、,,\s]+/).map(s => s.trim()).filter(Boolean);
        const merged = [...this.data.manualIngChips];
        for (const p of parts) {
            if (!merged.includes(p))
                merged.push(p);
        }
        this.setData({
            manualIngChips: merged,
            manualIngInput: '',
            manualIngSuggestions: this.computeIngSuggestions(merged)
        });
    },
    removeIngChip(e) {
        const name = e.currentTarget.dataset.name;
        const merged = this.data.manualIngChips.filter((c) => c !== name);
        this.setData({
            manualIngChips: merged,
            manualIngSuggestions: this.computeIngSuggestions(merged)
        });
    },
    pickIngSuggestion(e) {
        const name = e.currentTarget.dataset.name;
        if (this.data.manualIngChips.includes(name))
            return;
        const merged = [...this.data.manualIngChips, name];
        this.setData({
            manualIngChips: merged,
            manualIngSuggestions: this.computeIngSuggestions(merged)
        });
    },
    setManualPortion(e) {
        this.setData({ manualPortion: e.currentTarget.dataset.portion });
    },
    onManualNoteInput(e) {
        this.setData({ manualNote: e.detail.value });
    },
    saveManualLog() {
        const dish = (this.data.manualDishName || '').trim();
        const pending = (this.data.manualIngInput || '').trim();
        let ingredients = [...this.data.manualIngChips];
        if (pending) {
            const parts = pending.split(/[、,,\s]+/).map(s => s.trim()).filter(Boolean);
            for (const p of parts) {
                if (!ingredients.includes(p))
                    ingredients.push(p);
            }
        }
        if (!dish && ingredients.length === 0) {
            wx.showToast({ title: '至少填菜名或一个食材', icon: 'none' });
            return;
        }
        const portion = this.data.manualPortion || undefined;
        const note = (this.data.manualNote || '').trim() || undefined;
        const date = this.data.manualDate;
        const time = this.data.manualTime || '12:00';
        const isEditing = this.data.manualIsEditing;
        let idx;
        if (isEditing) {
            idx = this.data.manualEditMealIndex;
        }
        else {
            const usedIdx = new Set((0, journal_1.getJournal)().filter(l => l.date === date).map(l => l.mealIndex));
            let candidate = 0;
            while (usedIdx.has(candidate))
                candidate += 1;
            idx = candidate;
        }
        const existing = (0, journal_1.getJournal)().find(l => l.date === date && l.mealIndex === idx);
        const inferredPref = (portion === 'taste' || portion === 'small') ? 'dislike' :
            portion === 'full' ? 'love' :
                undefined;
        const finalPref = inferredPref !== undefined ? inferredPref : existing?.preference;
        const that = this;
        const finalIngredients = ingredients.length > 0 ? ingredients : [dish];
        const profileBefore = wx.getStorageSync('babyProfile');
        const progressBefore = profileBefore ? (0, planner_1.getTryingProgress)(profileBefore) : null;
        (0, journal_1.logMeal)({
            date,
            mealIndex: idx,
            recipeId: existing?.recipeId || `manual-${Date.now()}`,
            recipeName: existing?.recipeName || dish || ingredients.join('、'),
            ingredients: finalIngredients,
            loggedAt: existing?.loggedAt || new Date().toISOString(),
            eatenAt: (0, journal_1.combineTime)(date, time),
            ...(dish ? { customDishName: dish } : {}),
            ...(portion ? { portion } : {}),
            ...(finalPref ? { preference: finalPref } : {}),
            ...(note ? { note } : {}),
            isCustom: true
        });
        const profileAfter = wx.getStorageSync('babyProfile');
        let progressNote = '';
        if (profileAfter) {
            if ((0, planner_1.reconcileTryingReplaced)(profileAfter)) {
                wx.setStorageSync('babyProfile', profileAfter);
            }
            const progressAfter = (0, planner_1.getTryingProgress)(profileAfter);
            if (progressAfter && progressBefore && progressAfter.food === progressBefore.food) {
                const dayDelta = progressAfter.dayIndex - progressBefore.dayIndex;
                const reqDelta = progressBefore.daysRequired - progressAfter.daysRequired;
                if (dayDelta > 0 || reqDelta > 0) {
                    progressNote = `· 第 ${progressAfter.dayIndex}/${progressAfter.daysRequired} 天`;
                }
            }
        }
        this.setData({ manualOpen: false, manualIsEditing: false });
        this.refresh();
        const newFoods = profileAfter && !(0, planner_1.getCurrentTryingCategoryId)(profileAfter)
            ? detectNewFoodsForTrying(profileAfter, finalIngredients)
            : [];
        if (newFoods.length > 0) {
            const food = newFoods[0];
            const cat = (0, categories_1.getCategoryByFood)(food);
            const rest = newFoods.slice(1);
            const restNote = rest.length > 0 ? `\n\n还有新食材: ${rest.join('、')}, 一次只能排敏一个, 下次再启动。` : '';
            wx.showModal({
                title: `新食材: ${food}`,
                content: `要现在开始 ${food}（${cat.name}）3 天排敏吗?\n接下来吃含 ${food} 的菜, 3 天没反应就加入安全清单。${restNote}`,
                confirmText: '开始排敏',
                cancelText: '先不',
                success: (res) => {
                    if (!res.confirm)
                        return;
                    const profile = wx.getStorageSync('babyProfile');
                    if (!profile)
                        return;
                    const today = (0, planner_1.formatDate)(new Date());
                    const journal = wx.getStorageSync('mealJournal') || [];
                    const loggedIdxToday = new Set(journal.filter(l => l.date === today).map(l => l.mealIndex));
                    const plan = wx.getStorageSync('weeklyPlan') || [];
                    const todayPlan = plan.find(p => p.date === today);
                    const hasUnloggedToday = !!todayPlan && todayPlan.meals.some(m => !loggedIdxToday.has(m.mealIndex));
                    const result = (0, planner_1.startTryingForFood)(profile, cat.id, food, hasUnloggedToday);
                    if (!result)
                        return;
                    wx.setStorageSync('babyProfile', result.profile);
                    syncPlanForTrying(result.profile);
                    wx.showToast({
                        title: hasUnloggedToday ? `${food} 排敏已启动` : `${food} 排敏 明日开始`,
                        icon: 'success',
                        duration: 1800
                    });
                    that.refresh();
                }
            });
        }
        else {
            wx.showToast({
                title: `${isEditing ? '已更新' : '已补记'} ${progressNote}`.trim(),
                icon: progressNote ? 'none' : 'success',
                duration: progressNote ? 1800 : 800
            });
        }
    },
    undoCheckin(e) {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        (0, checkin_1.uncheckinMeal)(this.data.today, idx);
        wx.showToast({ title: '已撤销打卡', icon: 'none', duration: 800 });
        this.refresh();
    },
    confirmUndoCheckin(e) {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        wx.showModal({
            title: '撤销已喂完？',
            content: '会把这一餐恢复成未喂状态，已扣的库存会一起还原。',
            confirmText: '撤销',
            cancelText: '保留',
            success: (res) => {
                if (!res.confirm)
                    return;
                (0, checkin_1.uncheckinMeal)(this.data.today, idx);
                wx.showToast({ title: '已撤销', icon: 'none', duration: 800 });
                this.refresh();
            }
        });
    },
    openRecipe(e) {
        const id = e.currentTarget.dataset.id;
        if (id)
            wx.navigateTo({ url: `/pages/recipe/recipe?id=${id}` });
    },
    openActualSheet(e) {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        const meal = this.data.todayMeals.find(m => m.mealIndex === idx);
        if (!meal)
            return;
        const planIngredients = meal.recipe.ingredients.map((i) => i.name);
        const existingLog = (0, journal_1.getMealLog)(this.data.today, idx);
        const isEditing = !!existingLog;
        const initialSelected = isEditing
            ? (existingLog.ingredients || [])
            : planIngredients;
        const candidates = [];
        const seen = new Set();
        for (const n of initialSelected) {
            if (!seen.has(n)) {
                candidates.push(n);
                seen.add(n);
            }
        }
        for (const n of planIngredients) {
            if (!seen.has(n)) {
                candidates.push(n);
                seen.add(n);
            }
        }
        const journal = wx.getStorageSync('mealJournal') || [];
        const cutoff = Date.now() - 30 * 86400000;
        const counter = {};
        for (const l of journal) {
            const t = l.eatenAt ? new Date(l.eatenAt).getTime() : (l.loggedAt ? new Date(l.loggedAt).getTime() : 0);
            if (t < cutoff)
                continue;
            for (const ing of (l.ingredients || [])) {
                if (!ing || seen.has(ing))
                    continue;
                counter[ing] = (counter[ing] || 0) + 1;
            }
        }
        const recent = Object.entries(counter)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([n]) => n);
        for (const n of recent) {
            if (!seen.has(n)) {
                candidates.push(n);
                seen.add(n);
            }
        }
        const selectedSet = new Set(initialSelected);
        const chips = candidates.map(name => ({ name, selected: selectedSet.has(name) }));
        let initialTime = '';
        if (isEditing && existingLog) {
            const t = new Date(existingLog.eatenAt || existingLog.loggedAt);
            initialTime = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
        }
        else {
            const now = new Date();
            initialTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        }
        this.setData({
            actualSheetOpen: true,
            actualSheetCtx: {
                idx,
                mealLabel: `第 ${idx + 1} 餐`,
                planName: meal.recipe.name,
                planIngredientsText: planIngredients.join('、'),
                isEditing
            },
            actualDishName: isEditing ? (existingLog.customDishName || '') : '',
            actualIngredients: [...initialSelected],
            actualIngredientChips: chips,
            actualPortion: isEditing ? ((existingLog.portion === 'small' ? 'taste' : existingLog.portion) || '') : '',
            actualNote: isEditing ? (existingLog.note || '') : '',
            actualTime: initialTime,
            actualDetailsOpen: isEditing && !!(existingLog.customDishName || existingLog.note || existingLog.isCustom)
        });
    },
    onActualTimeChange(e) {
        this.setData({ actualTime: e.detail.value });
    },
    toggleActualDetails() {
        this.setData({ actualDetailsOpen: !this.data.actualDetailsOpen });
    },
    openPlanRecipeFromSheet() {
        const ctx = this.data.actualSheetCtx;
        if (!ctx)
            return;
        const meal = this.data.todayMeals.find(m => m.mealIndex === ctx.idx);
        if (!meal)
            return;
        wx.navigateTo({ url: `/pages/recipe/recipe?id=${meal.recipe.id}` });
    },
    closeActualSheet() {
        this.setData({ actualSheetOpen: false, actualSheetCtx: null, actualDishName: '', actualIngredients: [], actualIngredientChips: [], actualPortion: '', actualNote: '', actualTime: '', actualDetailsOpen: false });
    },
    saveAsPlanned() {
        const ctx = this.data.actualSheetCtx;
        if (!ctx)
            return;
        const meal = this.data.todayMeals.find(m => m.mealIndex === ctx.idx);
        if (!meal)
            return;
        const before = snapshotTryingProgress();
        if (ctx.isEditing) {
            const existing = (0, journal_1.getMealLog)(this.data.today, ctx.idx);
            (0, journal_1.logMeal)({
                date: this.data.today,
                mealIndex: ctx.idx,
                recipeId: meal.recipe.id,
                recipeName: meal.recipe.name,
                ingredients: meal.recipe.ingredients.map((i) => i.name),
                loggedAt: existing?.loggedAt || new Date().toISOString(),
                ...(existing?.eatenAt ? { eatenAt: existing.eatenAt } : {})
            });
        }
        else {
            (0, checkin_1.checkinMeal)(this.data.today, ctx.idx, meal.recipe);
        }
        toastWithTryingDelta(before, ctx.isEditing ? '已改为按计划' : '已按计划记录');
        this.closeActualSheet();
        this.refresh();
    },
    inputActualDishName(e) {
        this.setData({ actualDishName: e.detail.value });
    },
    clearActualDishName() {
        this.setData({ actualDishName: '' });
    },
    toggleActualIngredient(e) {
        const name = e.currentTarget.dataset.name;
        const chips = this.data.actualIngredientChips.map(c => c.name === name ? { ...c, selected: !c.selected } : c);
        const ingredients = chips.filter(c => c.selected).map(c => c.name);
        this.setData({ actualIngredientChips: chips, actualIngredients: ingredients });
    },
    addCustomIngredient() {
        const that = this;
        wx.showModal({
            title: '添加食材',
            editable: true,
            placeholderText: '如 米糊 / 自制浓汤宝',
            success: (res) => {
                if (!res.confirm || !res.content)
                    return;
                const name = res.content.trim();
                if (!name)
                    return;
                const chips = [...that.data.actualIngredientChips];
                if (!chips.find(c => c.name === name)) {
                    chips.push({ name, selected: true });
                }
                else {
                    const i = chips.findIndex(c => c.name === name);
                    chips[i] = { ...chips[i], selected: true };
                }
                const ingredients = chips.filter(c => c.selected).map(c => c.name);
                that.setData({ actualIngredientChips: chips, actualIngredients: ingredients });
            }
        });
    },
    setActualPortion(e) {
        const portion = e.currentTarget.dataset.portion;
        this.setData({ actualPortion: portion });
    },
    inputActualNote(e) {
        this.setData({ actualNote: e.detail.value });
    },
    saveActualRecord() {
        const ctx = this.data.actualSheetCtx;
        if (!ctx)
            return;
        const meal = this.data.todayMeals.find(m => m.mealIndex === ctx.idx);
        if (!meal)
            return;
        const dish = (this.data.actualDishName || '').trim();
        const ingredients = this.data.actualIngredients;
        if (ingredients.length === 0 && !dish) {
            wx.showToast({ title: '至少记一个食材', icon: 'none' });
            return;
        }
        const portion = this.data.actualPortion || undefined;
        const note = (this.data.actualNote || '').trim() || undefined;
        const isCustom = !!(dish || (ingredients.length > 0 && ingredients.join() !== meal.recipe.ingredients.map((i) => i.name).join()));
        if (ctx.isEditing) {
            const profile = wx.getStorageSync('babyProfile');
            const tryingFood = profile ? (0, planner_1.getTryingFood)(profile) : null;
            const planHasTrying = !!(tryingFood && meal.recipe.ingredients.some((i) => i.name === tryingFood));
            const actualHasTrying = !!(tryingFood && ingredients.includes(tryingFood));
            if (tryingFood && planHasTrying && !actualHasTrying) {
                const that = this;
                wx.showModal({
                    title: '从实际记录里去掉了排敏食材',
                    content: `${tryingFood} 不在你勾选的实际食材里。如果保存,这天可能不计入排敏天,观察期或被延长。继续吗?`,
                    confirmText: '仍然保存',
                    cancelText: '我再看看',
                    success: (res) => {
                        if (res.confirm)
                            that.doSaveActualLog(ctx, meal, dish, ingredients, portion, note, isCustom);
                    }
                });
                return;
            }
        }
        this.doSaveActualLog(ctx, meal, dish, ingredients, portion, note, isCustom);
    },
    doSaveActualLog(ctx, meal, dish, ingredients, portion, note, isCustom) {
        const time = (this.data.actualTime || '').trim();
        const eatenAt = time ? (0, journal_1.combineTime)(this.data.today, time) : undefined;
        const before = snapshotTryingProgress();
        const inferredPref = (portion === 'taste' || portion === 'small') ? 'dislike' :
            portion === 'full' ? 'love' :
                undefined;
        if (ctx.isEditing) {
            const existing = (0, journal_1.getMealLog)(this.data.today, ctx.idx);
            const finalPref = inferredPref !== undefined ? inferredPref : existing?.preference;
            (0, journal_1.logMeal)({
                date: this.data.today,
                mealIndex: ctx.idx,
                recipeId: meal.recipe.id,
                recipeName: meal.recipe.name,
                ingredients,
                loggedAt: existing?.loggedAt || new Date().toISOString(),
                ...(eatenAt ? { eatenAt } : (existing?.eatenAt ? { eatenAt: existing.eatenAt } : {})),
                ...(dish ? { customDishName: dish } : {}),
                ...(portion ? { portion } : {}),
                ...(note ? { note } : {}),
                ...(finalPref ? { preference: finalPref } : {}),
                ...(isCustom ? { isCustom: true } : {})
            });
            toastWithTryingDelta(before, '已更新记录', 900);
        }
        else {
            (0, checkin_1.checkinMeal)(this.data.today, ctx.idx, meal.recipe, {
                customDishName: dish || undefined,
                ...(isCustom ? { actualIngredients: ingredients } : {}),
                portion,
                note,
                eatenAt
            });
            if (inferredPref) {
                (0, journal_1.setPreference)(this.data.today, ctx.idx, inferredPref);
            }
            toastWithTryingDelta(before, isCustom ? '已记录' : '已按计划记录', 900);
        }
        this.closeActualSheet();
        this.refresh();
    },
    toggleMealLogged(e) {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        const meal = this.data.todayMeals.find(m => m.mealIndex === idx);
        if (!meal)
            return;
        if (meal.logged) {
            this.confirmUndoCheckin(e);
        }
        else {
            this.openActualSheet(e);
        }
    },
    replaceMeal(e) {
        const day = e.currentTarget.dataset.day;
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const targetDate = day === 'today'
            ? this.data.today
            : (0, planner_1.formatDate)(new Date(Date.now() + 86400000));
        const journal = wx.getStorageSync('mealJournal') || [];
        if (journal.some(l => l.date === targetDate && l.mealIndex === idx)) {
            wx.showToast({ title: '这餐已经吃过，只能编辑饮食记录', icon: 'none', duration: 1600 });
            return;
        }
        const plan = wx.getStorageSync('weeklyPlan') || [];
        const dayPlan = plan.find(p => p.date === targetDate);
        if (!dayPlan)
            return;
        const targetMeal = dayPlan.meals.find(m => m.mealIndex === idx);
        if (!targetMeal)
            return;
        const oldRecipe = targetMeal.recipe;
        const fridgeNames = new Set((0, storage_1.getFridge)().map(f => f.name));
        const candidates = (0, planner_1.pickReplacementCandidates)(profile, dayPlan, idx, 3, fridgeNames);
        if (candidates.length === 0) {
            wx.showToast({ title: '暂无营养均衡的其他食谱', icon: 'none' });
            return;
        }
        const loggedIdx = new Set(journal.filter(l => l.date === targetDate).map(l => l.mealIndex));
        const swapTargets = dayPlan.meals
            .filter(m => m.mealIndex !== idx && !loggedIdx.has(m.mealIndex))
            .map(m => ({
            idx: m.mealIndex,
            mealLabel: `第 ${m.mealIndex + 1} 餐`,
            name: m.recipe.name
        }));
        this.setData({
            replaceSheetOpen: true,
            replaceAltsExpanded: false,
            replaceCandidates: candidates.map(c => ({
                id: c.recipe.id,
                name: c.recipe.name,
                reason: c.reason,
                reasons: c.reasons,
                prepTime: c.prepTime,
                inFridgeAll: c.inFridgeAll,
                ingredientsText: c.recipe.ingredients.map(i => `${i.name} ${i.portions}份`).join(' + '),
                mitigationText: (c.warnings || []).map(w => `${w.foods.join('+')}：${w.mitigation || ''}`).join('；')
            })),
            replaceSwapTargets: swapTargets,
            replaceCtx: {
                day,
                date: targetDate,
                idx,
                mealLabel: `第 ${idx + 1} 餐`,
                oldName: oldRecipe.name
            }
        });
    },
    swapMeals(e) {
        const targetIdx = parseInt(e.currentTarget.dataset.idx, 10);
        const ctx = this.data.replaceCtx;
        if (!ctx)
            return;
        const plan = wx.getStorageSync('weeklyPlan') || [];
        const dayPlan = plan.find(p => p.date === ctx.date);
        if (!dayPlan)
            return;
        const journal = wx.getStorageSync('mealJournal') || [];
        const loggedIdx = new Set(journal.filter(l => l.date === ctx.date).map(l => l.mealIndex));
        if (loggedIdx.has(ctx.idx) || loggedIdx.has(targetIdx)) {
            wx.showToast({ title: '已吃餐次不能互换', icon: 'none', duration: 1400 });
            this.closeReplaceSheet();
            return;
        }
        const a = dayPlan.meals.find(m => m.mealIndex === ctx.idx);
        const b = dayPlan.meals.find(m => m.mealIndex === targetIdx);
        if (!a || !b)
            return;
        const tmp = { recipe: a.recipe, trialIngredient: a.trialIngredient, trialMethod: a.trialMethod };
        a.recipe = b.recipe;
        a.trialIngredient = b.trialIngredient;
        a.trialMethod = b.trialMethod;
        b.recipe = tmp.recipe;
        b.trialIngredient = tmp.trialIngredient;
        b.trialMethod = tmp.trialMethod;
        wx.setStorageSync('weeklyPlan', plan);
        wx.showToast({ title: `已互换 ${ctx.mealLabel} ↔ 第 ${targetIdx + 1} 餐`, icon: 'success', duration: 1200 });
        this.setData({ replaceSheetOpen: false, replaceCandidates: [], replaceSwapTargets: [], replaceCtx: null });
        this.refresh();
    },
    refreshReplaceCandidates() {
        const ctx = this.data.replaceCtx;
        if (!ctx)
            return;
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const plan = wx.getStorageSync('weeklyPlan') || [];
        const dayPlan = plan.find(p => p.date === ctx.date);
        if (!dayPlan)
            return;
        const fridgeNames = new Set((0, storage_1.getFridge)().map(f => f.name));
        const currentIds = (this.data.replaceCandidates || []).map(c => c.id);
        const candidates = (0, planner_1.pickReplacementCandidates)(profile, dayPlan, ctx.idx, 3, fridgeNames, currentIds);
        this.setData({
            replaceCandidates: candidates.map(c => ({
                id: c.recipe.id,
                name: c.recipe.name,
                reason: c.reason,
                ingredientsText: c.recipe.ingredients.map(i => `${i.name} ${i.portions}份`).join(' + '),
                mitigationText: (c.warnings || []).map(w => `${w.foods.join('+')}：${w.mitigation || ''}`).join('；')
            }))
        });
    },
    closeReplaceSheet() {
        this.setData({ replaceSheetOpen: false, replaceCandidates: [], replaceSwapTargets: [], replaceAltsExpanded: false, replaceCtx: null });
    },
    toggleReplaceAlts() {
        this.setData({ replaceAltsExpanded: !this.data.replaceAltsExpanded });
    },
    stopPropagation() { },
    confirmReplacement(e) {
        const recipeId = e.currentTarget.dataset.id;
        const ctx = this.data.replaceCtx;
        if (!ctx)
            return;
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const plan = wx.getStorageSync('weeklyPlan') || [];
        const dayPlan = plan.find(p => p.date === ctx.date);
        if (!dayPlan)
            return;
        const latestJournal = wx.getStorageSync('mealJournal') || [];
        if (latestJournal.some(l => l.date === ctx.date && l.mealIndex === ctx.idx)) {
            wx.showToast({ title: '这餐已经吃过，只能编辑饮食记录', icon: 'none', duration: 1600 });
            this.closeReplaceSheet();
            return;
        }
        const applicable = (0, planner_1.getApplicableRecipes)(profile);
        const newRecipe = applicable.find(r => r.id === recipeId);
        if (!newRecipe) {
            wx.showToast({ title: '食谱不可用', icon: 'none' });
            return;
        }
        const targetMeal = dayPlan.meals.find(m => m.mealIndex === ctx.idx);
        if (!targetMeal)
            return;
        const oldRecipe = targetMeal.recipe;
        const tryingFood = (0, planner_1.getTryingFood)(profile);
        const oldUsesTrying = !!(tryingFood && oldRecipe.ingredients.some(i => i.name === tryingFood));
        const journal = latestJournal;
        const todayAlreadyAteTrying = !!(tryingFood && journal.some(l => l.date === ctx.date && (l.ingredients || []).includes(tryingFood)));
        const otherMealsHaveTrying = !!(tryingFood && dayPlan.meals.some(m => m.mealIndex !== ctx.idx && m.recipe.ingredients.some(ing => ing.name === tryingFood)));
        const newRecipeHasTrying = !!(tryingFood && newRecipe.ingredients.some(i => i.name === tryingFood));
        const willStillHaveTryingAfter = newRecipeHasTrying || otherMealsHaveTrying;
        const doReplace = () => {
            targetMeal.recipe = newRecipe;
            const stillHasTrying = !!(tryingFood && dayPlan.meals.some(m => m.recipe.ingredients.some(ing => ing.name === tryingFood)));
            if (oldUsesTrying && !todayAlreadyAteTrying && !stillHasTrying && tryingFood) {
                const tryingCatId = (0, planner_1.getCurrentTryingCategoryId)(profile);
                if (tryingCatId) {
                    const updated = (0, planner_1.recordTryingReplaced)(profile, tryingCatId, ctx.date);
                    wx.setStorageSync('babyProfile', updated);
                }
            }
            wx.setStorageSync('weeklyPlan', plan);
            this.closeReplaceSheet();
            wx.showToast({ title: '已替换，营养已同步', icon: 'success', duration: 1200 });
            this.refresh();
        };
        if (oldUsesTrying && !todayAlreadyAteTrying && !willStillHaveTryingAfter) {
            wx.showModal({
                title: '替换会延长观察期',
                content: `这一顿包含正在排敏的 ${tryingFood}，替换后这天不算排敏天，观察期会延长 1 天。继续吗?`,
                success: (res) => { if (res.confirm)
                    doReplace(); }
            });
        }
        else {
            doReplace();
        }
    },
    openMoreRecsSheet() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const allRecs = (0, planner_1.getNextRecommendation)(profile);
        const list = allRecs.map(r => ({
            catId: r.categoryId,
            food: r.firstFood,
            category: r.category,
            reason: r.reason,
            daysRequired: r.daysRequired,
            isInCategory: r.mode === 'newFoodInOpenCategory'
        }));
        this.setData({ moreRecsSheetOpen: true, moreRecsList: list });
    },
    closeMoreRecsSheet() {
        this.setData({ moreRecsSheetOpen: false });
    },
    pickRecFromSheet(e) {
        const catId = e.currentTarget.dataset.catId;
        const food = e.currentTarget.dataset.food;
        const days = parseInt(e.currentTarget.dataset.days, 10) || 3;
        this.setData({ moreRecsSheetOpen: false });
        this.startTryingFromAdvice(catId, food, days);
    },
    triggerAdvicePrimary() {
        const cta = this.data.todayAdvice?.ctaPrimary;
        if (cta)
            this.dispatchAdviceAction(cta);
    },
    triggerAdviceSecondary() {
        const cta = this.data.todayAdvice?.ctaSecondary;
        if (cta)
            this.dispatchAdviceAction(cta);
    },
    dispatchAdviceAction(cta) {
        switch (cta.action) {
            case 'startTrying':
                if (cta.catId && cta.food) {
                    this.startTryingFromAdvice(cta.catId, cta.food, cta.daysRequired || 3);
                }
                else {
                    wx.showToast({ title: '推荐数据缺失，请去排敏档案手动启动', icon: 'none', duration: 1800 });
                }
                break;
            case 'viewReactions':
                wx.navigateTo({ url: '/pages/reactions/reactions' });
                break;
            case 'endProtection':
                this.setStatusNormal();
                break;
            case 'confirmTrying':
                this.confirmTryingEarly();
                break;
            case 'abortTrying':
                this.abortTryingFood();
                break;
            case 'viewTomorrow':
                wx.pageScrollTo({ selector: '.tomorrow-card', duration: 300 });
                break;
        }
    },
    startTryingFromAdvice(catId, food, daysRequired = 3) {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const currentTrying = (0, planner_1.getCurrentTryingCategoryId)(profile);
        if (currentTrying) {
            const tryingFood = profile.categoryAllergies[currentTrying]?.tryingFood;
            wx.showToast({ title: `先完成 ${tryingFood} 排敏再引入新食物`, icon: 'none', duration: 1800 });
            return;
        }
        const todayDate = (0, planner_1.formatDate)(new Date());
        const journal = wx.getStorageSync('mealJournal') || [];
        const loggedIdxToday = new Set(journal.filter(l => l.date === todayDate).map(l => l.mealIndex));
        const planNow = wx.getStorageSync('weeklyPlan') || [];
        const todayPlanNow = planNow.find(p => p.date === todayDate);
        const hasUnloggedToday = !!todayPlanNow && todayPlanNow.meals.some(m => !loggedIdxToday.has(m.mealIndex));
        const result = (0, planner_1.startTryingForFood)(profile, catId, food, hasUnloggedToday, daysRequired);
        if (!result)
            return;
        wx.setStorageSync('babyProfile', result.profile);
        rebuildPlan(result.profile);
        this.refresh();
        const newPlan = wx.getStorageSync('weeklyPlan') || [];
        const todayStr = (0, planner_1.formatDate)(new Date());
        const todayPlan = newPlan.find(p => p.date === todayStr);
        const todayCount = todayPlan ? todayPlan.meals.filter(m => m.recipe.ingredients.some(i => i.name === food)).length : 0;
        const recipesWithTrying = (0, planner_1.getApplicableRecipes)(profile).filter(r => r.ingredients.some(i => i.name === food)).length;
        const passLabel = result.isInCategoryAdd ? `${food} 加入安全清单` : '开放整类';
        if (hasUnloggedToday && todayCount > 0) {
            wx.showModal({
                title: `${food} 排敏已启动`,
                content: `今日有 ${todayCount} 餐含 ${food}，喂完后观察 ${daysRequired} 天没反应就${passLabel}。`,
                showCancel: false,
                confirmText: '看看菜单',
                success: (res) => {
                    if (res.confirm)
                        wx.pageScrollTo({ selector: '.plan-card', duration: 300 });
                }
            });
        }
        else if (hasUnloggedToday && todayCount === 0) {
            this.showTrialSlotModal(food, daysRequired, newPlan, todayStr);
        }
        else {
            const newPlanX = wx.getStorageSync('weeklyPlan') || [];
            const tomorrowStr = (0, planner_1.formatDate)(new Date(Date.now() + 86400000));
            const tomorrowPlan = newPlanX.find(p => p.date === tomorrowStr);
            const tomorrowCount = tomorrowPlan ? tomorrowPlan.meals.filter(m => m.recipe.ingredients.some(i => i.name === food)).length : 0;
            if (tomorrowCount > 0) {
                wx.showModal({
                    title: `${food} 排敏，明日开始`,
                    content: `明日 ${tomorrowCount} 餐含 ${food}，从明天起观察 ${daysRequired} 天。`,
                    showCancel: false,
                    confirmText: '知道了'
                });
            }
            else {
                this.showTrialSlotModal(food, daysRequired, newPlanX, tomorrowStr);
            }
        }
    },
    showTrialSlotModal(food, daysRequired, plans, fromDate) {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const journal = wx.getStorageSync('mealJournal') || [];
        const loggedKeys = new Set(journal.map(l => `${l.date}-${l.mealIndex}`));
        const slot = (0, planner_1.suggestTrialSlot)(profile, food, plans, fromDate, loggedKeys);
        const method = (0, planner_1.getFirstTryMethod)(food);
        if (!slot) {
            wx.showModal({
                title: `${food} 排敏已启动`,
                content: `当前餐次都不太适合搭配 ${food}。建议单独喂 1 勺 ${food}（${method}），喂完后观察 ${daysRequired} 天没反应就通过。`,
                showCancel: false,
                confirmText: '知道了'
            });
            return;
        }
        const updatedPlans = (0, planner_1.attachTrialIngredient)(plans, slot.date, slot.mealIdx, food);
        wx.setStorageSync('weeklyPlan', updatedPlans);
        this.refresh();
        const todayStr = (0, planner_1.formatDate)(new Date());
        const tomorrowStr = (0, planner_1.formatDate)(new Date(Date.now() + 86400000));
        let dayLabel = slot.date;
        if (slot.date === todayStr)
            dayLabel = '今日';
        else if (slot.date === tomorrowStr)
            dayLabel = '明日';
        const mealLabel = `第 ${slot.mealIdx + 1} 餐`;
        const warnLine = slot.warnings.length > 0
            ? `\n💡 提示: ${slot.warnings.map(w => w.mitigation).join('；')}`
            : '';
        wx.showModal({
            title: `${food} 排敏已启动`,
            content: `当前食谱凑不出含 ${food} 的整道菜。\n\n建议在${dayLabel}${mealLabel}「${slot.recipeName}」里加 1 勺 ${food}（${method}），喂完后观察 ${daysRequired} 天没反应就通过。${warnLine}`,
            showCancel: false,
            confirmText: '知道了'
        });
    },
    adjustTomorrow() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const existing = wx.getStorageSync('weeklyPlan') || [];
        const newPlan = (0, planner_1.regenerateTomorrowOnward)(profile, existing);
        wx.setStorageSync('weeklyPlan', newPlan);
        wx.showToast({ title: '已调整明日及之后', icon: 'success', duration: 1000 });
        this.refresh();
    },
    retryPass(e) {
        const name = e.currentTarget.dataset.name;
        const profile = (0, observation_1.recordRetry)(wx.getStorageSync('babyProfile'), name, 'pass');
        wx.setStorageSync('babyProfile', profile);
        rebuildPlan(wx.getStorageSync('babyProfile'));
        wx.showToast({ title: `${name} 重试通过,已恢复使用`, icon: 'success', duration: 1500 });
        this.refresh();
    },
    retryFail(e) {
        const name = e.currentTarget.dataset.name;
        wx.showModal({
            title: '确认仍过敏',
            content: `${name} 再次出现反应?将永久标记为过敏。`,
            success: (res) => {
                if (!res.confirm)
                    return;
                const profile = (0, observation_1.recordRetry)(wx.getStorageSync('babyProfile'), name, 'fail');
                wx.setStorageSync('babyProfile', profile);
                rebuildPlan(wx.getStorageSync('babyProfile'));
                wx.showToast({ title: `${name} 已确诊过敏`, icon: 'none', duration: 1500 });
                this.refresh();
            }
        });
    },
    acceptRec(e) {
        const catId = e.currentTarget.dataset.catId;
        const rep = e.currentTarget.dataset.rep;
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const currentTrying = (0, planner_1.getCurrentTryingCategoryId)(profile);
        if (currentTrying) {
            const tryingFood = profile.categoryAllergies[currentTrying]?.tryingFood;
            wx.showToast({ title: `先完成 ${tryingFood} 排敏再引入新食物`, icon: 'none', duration: 1800 });
            return;
        }
        const existing = profile.categoryAllergies[catId] || { state: 'untried' };
        const days = existing.state === 'open' ? 2 : 3;
        profile.categoryAllergies[catId] = {
            ...existing,
            state: 'trying',
            tryingFood: rep,
            tryingDaysRequired: days,
            tryingStartDate: new Date().toISOString().slice(0, 10),
            tryingReplacedDates: []
        };
        wx.setStorageSync('babyProfile', profile);
        rebuildPlan(profile);
        wx.showToast({ title: `${rep} 排敏开始(需观察${days}天)`, icon: 'none', duration: 1800 });
        this.refresh();
    },
    toggleRecExpand() {
        this.setData({ recExpanded: !this.data.recExpanded });
    },
    confirmTryingEarly() {
        const t = this.data.trying;
        if (!t)
            return;
        wx.showModal({
            title: '提前确认安全',
            content: `${t.food} 已观察 ${t.dayIndex} 天没反应,确认转为已开放?\n(建议至少观察满 3 天)`,
            success: (res) => {
                if (!res.confirm)
                    return;
                const profile = wx.getStorageSync('babyProfile');
                const updated = (0, planner_1.completeTrying)(profile, t.categoryId);
                wx.setStorageSync('babyProfile', updated);
                rebuildPlan(wx.getStorageSync('babyProfile'));
                const plansAfter = wx.getStorageSync('weeklyPlan') || [];
                wx.setStorageSync('weeklyPlan', (0, planner_1.clearTrialIngredient)(plansAfter, t.food));
                wx.showToast({ title: `${t.food} 已加入安全清单`, icon: 'success' });
                this.refresh();
            }
        });
    },
    abortTryingFood() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const catId = (0, planner_1.getCurrentTryingCategoryId)(profile);
        if (!catId)
            return;
        const food = profile.categoryAllergies[catId]?.tryingFood || '';
        wx.showModal({
            title: '停止排敏',
            content: `停止 ${food} 排敏?该品类会回到"未引入"状态。`,
            confirmText: '停止',
            confirmColor: '#E57373',
            success: (res) => {
                if (!res.confirm)
                    return;
                const updated = (0, planner_1.abortTrying)(profile, catId);
                wx.setStorageSync('babyProfile', updated);
                rebuildPlan(wx.getStorageSync('babyProfile'));
                const plansAfter = wx.getStorageSync('weeklyPlan') || [];
                wx.setStorageSync('weeklyPlan', (0, planner_1.clearTrialIngredient)(plansAfter, food));
                wx.showToast({ title: '已停止排敏', icon: 'none' });
                this.refresh();
            }
        });
    },
    editName() {
        this.setData({ editing: { ...this.data.editing, name: true } });
    },
    commitName(e) {
        const value = (e.detail.value || '').trim();
        if (!value) {
            this.setData({ editing: { ...this.data.editing, name: false } });
            return;
        }
        const profile = wx.getStorageSync('babyProfile');
        profile.babyName = value;
        wx.setStorageSync('babyProfile', profile);
        this.setData({
            babyName: value,
            editing: { ...this.data.editing, name: false }
        });
    },
    commitBirthday(e) {
        const value = e.detail.value;
        if (!value)
            return;
        const profile = wx.getStorageSync('babyProfile');
        profile.birthday = value;
        profile.ageMonths = (0, planner_1.calcAgeMonths)(value);
        wx.setStorageSync('babyProfile', profile);
        rebuildPlan(wx.getStorageSync('babyProfile'));
        wx.showToast({ title: `已设置生日 ${value}`, icon: 'none', duration: 1200 });
        this.refresh();
    },
    commitMeals(e) {
        const value = parseInt(e.detail.value, 10) + 1;
        const profile = wx.getStorageSync('babyProfile');
        profile.mealsPerDay = value;
        wx.setStorageSync('babyProfile', profile);
        rebuildPlan(wx.getStorageSync('babyProfile'));
        wx.showToast({ title: `已改为每日${value}顿`, icon: 'none', duration: 1200 });
        this.refresh();
    },
    noop() { },
    goReactions() {
        wx.navigateTo({ url: '/pages/reactions/reactions' });
    },
    toggleTomorrow() {
        this.setData({ tomorrowExpanded: !this.data.tomorrowExpanded });
    },
    openStatusSheet() {
        this.setData({ statusSheetVisible: true });
    },
    gotoReviewFromBanner() {
        this.setData({ statusSheetVisible: false });
        wx.switchTab({ url: '/pages/review/review' });
    },
    closeStatusSheet() {
        this.setData({ statusSheetVisible: false });
    },
    setStatusNormal() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        profile.currentStatus = 'normal';
        profile.statusSince = undefined;
        wx.setStorageSync('babyProfile', profile);
        const reactions = (0, reactions_1.getReactions)();
        const nowIso = new Date().toISOString();
        let mutated = false;
        for (const r of reactions) {
            if ((r.type === 'gut' || r.type === 'constipation') && !r.resolvedAt) {
                r.resolvedAt = nowIso;
                mutated = true;
            }
        }
        if (mutated)
            (0, reactions_1.setReactions)(reactions);
        rebuildPlan(wx.getStorageSync('babyProfile'));
        wx.showToast({ title: '已切换为正常', icon: 'success', duration: 1000 });
        this.setData({ statusSheetVisible: false });
        this.refresh();
    },
    setStatusPostVaccine(e) {
        const date = e.detail.value;
        if (!date)
            return;
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        profile.currentStatus = 'postVaccine';
        profile.statusSince = date;
        wx.setStorageSync('babyProfile', profile);
        rebuildPlan(wx.getStorageSync('babyProfile'));
        wx.showToast({ title: `疫苗后保护已开启`, icon: 'success', duration: 1200 });
        this.setData({ statusSheetVisible: false });
        this.refresh();
    },
    onShareAppMessage() {
        return {
            title: '辅食搭子 - 帮你管好宝宝辅食',
            path: '/pages/index/index'
        };
    },
    onShareTimeline() {
        return {
            title: '辅食搭子 - 帮你管好宝宝辅食'
        };
    }
});
