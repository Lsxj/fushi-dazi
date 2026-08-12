"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEMBER_INTRODUCE_DAYS = exports.TRYING_DAYS_INCATEGORY = exports.TRYING_DAYS_REQUIRED = void 0;
exports.reconcileCategorySchema = reconcileCategorySchema;
exports.calcAgeMonths = calcAgeMonths;
exports.hasActiveGutReaction = hasActiveGutReaction;
exports.hasActiveConstipation = hasActiveConstipation;
exports.isFoodSafeForBaby = isFoodSafeForBaby;
exports.getCurrentTryingCategoryId = getCurrentTryingCategoryId;
exports.getTryingFood = getTryingFood;
exports.getTryingProgress = getTryingProgress;
exports.getTryingScheduledStart = getTryingScheduledStart;
exports.checkTryingComplete = checkTryingComplete;
exports.completeTrying = completeTrying;
exports.abortTrying = abortTrying;
exports.startTryingForFood = startTryingForFood;
exports.reconcileTryingReplaced = reconcileTryingReplaced;
exports.reconcileExceptions = reconcileExceptions;
exports.recordTryingReplaced = recordTryingReplaced;
exports.isRecipeApplicable = isRecipeApplicable;
exports.getApplicableRecipes = getApplicableRecipes;
exports.findIntroducingBases = findIntroducingBases;
exports.getFirstTryMethod = getFirstTryMethod;
exports.attachTrialIngredient = attachTrialIngredient;
exports.clearTrialIngredient = clearTrialIngredient;
exports.suggestTrialSlot = suggestTrialSlot;
exports.getRecipeTabooWarnings = getRecipeTabooWarnings;
exports.diagnoseEmptyPlan = diagnoseEmptyPlan;
exports.generateWeeklyPlan = generateWeeklyPlan;
exports.pickReplacement = pickReplacement;
exports.pickReplacementCandidates = pickReplacementCandidates;
exports.regenerateFromToday = regenerateFromToday;
exports.preserveLoggedMealFacts = preserveLoggedMealFacts;
exports.regenerateTomorrowOnward = regenerateTomorrowOnward;
exports.regenerateKeepingLoggedToday = regenerateKeepingLoggedToday;
exports.rebuildPlanPreservingLoggedMeals = rebuildPlanPreservingLoggedMeals;
exports.formatDate = formatDate;
exports.getWeekday = getWeekday;
exports.getNextRecommendation = getNextRecommendation;
exports.aggregateShoppingList = aggregateShoppingList;
exports.aggregateShoppingListForFutureDays = aggregateShoppingListForFutureDays;
const categories_1 = require("../data/categories");
const recipes_1 = require("../data/recipes");
const taboos_1 = require("../data/taboos");
const nutrition_1 = require("./nutrition");
const ingredients_1 = require("../data/ingredients");
exports.TRYING_DAYS_REQUIRED = 3;
exports.TRYING_DAYS_INCATEGORY = 3;
const CATEGORY_SCHEMA_VERSION = 2;
function reconcileCategorySchema(profile) {
    if (!profile.categoryAllergies)
        profile.categoryAllergies = {};
    if (!profile.individualExceptions)
        profile.individualExceptions = {};
    const states = profile.categoryAllergies;
    const confirmed = new Set(profile.confirmedFoods || []);
    let changed = false;
    const splitSource = {
        nightshade: 'gourd',
        fruitMelon: 'fruitLow',
        fruitStoneBerry: 'fruitLow',
        fruitCitrus: 'fruitHigh',
        mollusc: 'shrimp',
        peanut: 'nuts'
    };
    for (const cat of categories_1.CATEGORIES) {
        if (states[cat.id])
            continue;
        const confirmedHere = (0, categories_1.getPrimaryMembers)(cat.id).filter(name => confirmed.has(name));
        const source = states[splitSource[cat.id]];
        if (source?.state === 'trying' && source.tryingFood && cat.members.includes(source.tryingFood)) {
            states[cat.id] = { ...source };
            changed = true;
            continue;
        }
        if (confirmedHere.length > 0) {
            states[cat.id] = {
                state: 'open',
                representative: confirmedHere[0],
                passedDate: source?.passedDate
            };
            changed = true;
            continue;
        }
        if (source?.state === 'observation') {
            states[cat.id] = { ...source };
            changed = true;
            continue;
        }
        states[cat.id] = {
            state: !cat.noAllergyTracking && cat.recommendedMonth > profile.ageMonths + 6 ? 'locked' : (cat.noAllergyTracking ? 'open' : 'untried')
        };
        changed = true;
    }
    for (const sourceId of ['gourd', 'fruitLow', 'fruitHigh', 'shrimp', 'nuts']) {
        const state = states[sourceId];
        if (!state?.tryingFood)
            continue;
        const actualCat = (0, categories_1.getCategoryByFood)(state.tryingFood);
        if (!actualCat || actualCat.id === sourceId)
            continue;
        const sourceDef = categories_1.CATEGORIES.find(c => c.id === sourceId);
        const confirmedHere = sourceDef ? (0, categories_1.getPrimaryMembers)(sourceId).filter(name => confirmed.has(name)) : [];
        states[sourceId] = confirmedHere.length > 0
            ? { state: 'open', representative: confirmedHere[0], passedDate: state.passedDate }
            : { state: 'untried' };
        changed = true;
    }
    if (profile.categorySchemaVersion !== CATEGORY_SCHEMA_VERSION) {
        profile.categorySchemaVersion = CATEGORY_SCHEMA_VERSION;
        changed = true;
    }
    return changed;
}
function getTryingDaysFor(cat) {
    return cat.tryingDaysRequired || exports.TRYING_DAYS_REQUIRED;
}
function parseLocalDate(yyyymmdd) {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
}
exports.MEMBER_INTRODUCE_DAYS = 3;
function calcAgeMonths(birthday, refDate) {
    const parts = birthday.slice(0, 10).split('-').map(Number);
    const birth = parts.length === 3 && !parts.some(isNaN)
        ? new Date(parts[0], parts[1] - 1, parts[2])
        : new Date(birthday);
    const ref = refDate || new Date();
    let months = (ref.getFullYear() - birth.getFullYear()) * 12 + (ref.getMonth() - birth.getMonth());
    if (ref.getDate() < birth.getDate())
        months -= 1;
    return Math.max(0, months);
}
function hasActiveGutReaction() {
    const reactions = wx.getStorageSync('reactions') || [];
    const cutoff = Date.now() - 3 * 86400 * 1000;
    return reactions.some(r => r.type === 'gut' &&
        !r.resolvedAt &&
        new Date(r.occurredAt).getTime() >= cutoff);
}
function hasActiveConstipation() {
    const reactions = wx.getStorageSync('reactions') || [];
    const cutoff = Date.now() - 5 * 86400 * 1000;
    return reactions.some(r => r.type === 'constipation' &&
        !r.resolvedAt &&
        new Date(r.occurredAt).getTime() >= cutoff);
}
function isFoodSafeForBaby(foodName, profile) {
    const exception = profile.individualExceptions[foodName];
    if (exception?.state === 'allergic')
        return { safe: false, reason: `${foodName}已标记过敏` };
    if (exception?.state === 'observation')
        return { safe: false, reason: `${foodName}处于观察期` };
    if (exception?.state === 'introducing')
        return { safe: false, reason: `${foodName}正在 3 天引入观察` };
    const category = (0, categories_1.getCategoryByFood)(foodName);
    if (!category)
        return { safe: false, reason: `${foodName}未在分类库` };
    if (category.noAllergyTracking)
        return { safe: true };
    const cat = profile.categoryAllergies[category.id];
    if (!cat)
        return { safe: false, reason: `${category.name}未引入` };
    if (profile.currentStatus === 'postVaccine') {
        const confirmed = profile.confirmedFoods || [];
        if (!confirmed.includes(foodName)) {
            return { safe: false, reason: `疫苗期间只用确认稳定的食物,${foodName}不在清单内` };
        }
        if (profile.statusSince && cat.passedDate && cat.passedDate >= profile.statusSince) {
            return { safe: false, reason: `${category.name}是在疫苗后开放的,等状态恢复正常再用` };
        }
    }
    if (cat.state === 'open') {
        const confirmed = profile.confirmedFoods || [];
        if (confirmed.includes(foodName))
            return { safe: true };
        if (cat.representative === foodName)
            return { safe: true };
        const parent = (0, categories_1.getParentFood)(foodName);
        if (parent && (confirmed.includes(parent) || cat.representative === parent)) {
            return { safe: true };
        }
        const primaries = (0, categories_1.getPrimaryMembers)(category.id);
        const confirmedInCat = primaries.filter(m => confirmed.includes(m));
        if (confirmedInCat.length === 0 && !cat.representative && primaries[0] === foodName) {
            return { safe: true };
        }
        return { safe: false, reason: `${foodName}还没单独尝试过，建议先排敏` };
    }
    if (cat.state === 'trying') {
        if (foodName === cat.tryingFood)
            return { safe: true };
        const confirmed = profile.confirmedFoods || [];
        if (confirmed.includes(foodName))
            return { safe: true };
        return { safe: false, reason: `${category.name}排敏中,只能用${cat.tryingFood}或已确认食材` };
    }
    if (cat.state === 'observation') {
        return { safe: false, reason: `${category.name}处于观察期(${cat.note || '冷却中'})` };
    }
    if (cat.state === 'untried')
        return { safe: false, reason: `${category.name}未引入` };
    if (cat.state === 'locked')
        return { safe: false, reason: `${category.name}暂未到引入月龄` };
    return { safe: false };
}
function getCurrentTryingCategoryId(profile) {
    for (const [id, cat] of Object.entries(profile.categoryAllergies)) {
        if (cat.state === 'trying')
            return id;
    }
    return null;
}
function getTryingFood(profile) {
    for (const cat of Object.values(profile.categoryAllergies)) {
        if (cat.state === 'trying' && cat.tryingFood)
            return cat.tryingFood;
    }
    return null;
}
function getTryingProgress(profile) {
    for (const [id, cat] of Object.entries(profile.categoryAllergies)) {
        if (cat.state === 'trying' && cat.tryingFood && cat.tryingStartDate) {
            const start = parseLocalDate(cat.tryingStartDate);
            const today = new Date().setHours(0, 0, 0, 0);
            const daysSince = Math.floor((today - start) / 86400000);
            if (daysSince < 0)
                return null;
            const replacedCount = (cat.tryingReplacedDates || []).length;
            const baseDaysRequired = getTryingDaysFor(cat);
            const daysRequired = baseDaysRequired + replacedCount;
            const journal = wx.getStorageSync('mealJournal') || [];
            const validDates = new Set();
            for (const log of journal) {
                if (log.date >= cat.tryingStartDate && (log.ingredients || []).includes(cat.tryingFood)) {
                    validDates.add(log.date);
                }
            }
            const dayIndex = Math.min(validDates.size, daysRequired);
            return {
                food: cat.tryingFood,
                categoryId: id,
                dayIndex,
                daysRequired,
                startDate: cat.tryingStartDate
            };
        }
    }
    return null;
}
function getTryingScheduledStart(profile) {
    for (const [id, cat] of Object.entries(profile.categoryAllergies)) {
        if (cat.state === 'trying' && cat.tryingFood && cat.tryingStartDate) {
            const start = parseLocalDate(cat.tryingStartDate);
            const today = new Date().setHours(0, 0, 0, 0);
            const daysSince = Math.floor((today - start) / 86400000);
            if (daysSince < 0) {
                return { food: cat.tryingFood, categoryId: id, startDate: cat.tryingStartDate };
            }
        }
    }
    return null;
}
function checkTryingComplete(profile) {
    const progress = getTryingProgress(profile);
    if (!progress)
        return null;
    if (progress.dayIndex >= progress.daysRequired) {
        return { categoryId: progress.categoryId, food: progress.food };
    }
    return null;
}
function completeTrying(profile, categoryId) {
    const cat = profile.categoryAllergies[categoryId];
    if (!cat || cat.state !== 'trying')
        return profile;
    const food = cat.tryingFood;
    const isInCategoryAdd = !!cat.representative && cat.representative !== food;
    profile.categoryAllergies[categoryId] = {
        state: 'open',
        representative: isInCategoryAdd ? cat.representative : food,
        passedDate: cat.passedDate || new Date().toISOString().slice(0, 10)
    };
    if (food) {
        if (profile.individualExceptions[food]) {
            delete profile.individualExceptions[food];
        }
        if (!profile.confirmedFoods)
            profile.confirmedFoods = [];
        if (!profile.confirmedFoods.includes(food)) {
            profile.confirmedFoods.push(food);
        }
        if (!profile.recentlyAddedFoods)
            profile.recentlyAddedFoods = [];
        const today = new Date().toISOString().slice(0, 10);
        if (!profile.recentlyAddedFoods.find(f => f.name === food)) {
            profile.recentlyAddedFoods.push({ name: food, addedAt: today });
        }
    }
    return profile;
}
function abortTrying(profile, categoryId) {
    const cat = profile.categoryAllergies[categoryId];
    if (!cat || cat.state !== 'trying')
        return profile;
    const confirmed = profile.confirmedFoods || [];
    const catDef = categories_1.CATEGORIES.find(c => c.id === categoryId);
    const otherConfirmedInCategory = !!catDef && catDef.members.some(m => m !== cat.tryingFood && confirmed.includes(m));
    const hasRep = !!cat.representative && cat.representative !== cat.tryingFood;
    const isInCategoryAdd = hasRep || otherConfirmedInCategory;
    if (isInCategoryAdd) {
        const rep = (cat.representative && cat.representative !== cat.tryingFood)
            ? cat.representative
            : (catDef?.members.find(m => m !== cat.tryingFood && confirmed.includes(m)) || cat.representative);
        profile.categoryAllergies[categoryId] = {
            state: 'open',
            representative: rep,
            passedDate: cat.passedDate || new Date().toISOString().slice(0, 10)
        };
    }
    else {
        profile.categoryAllergies[categoryId] = { state: 'untried' };
    }
    return profile;
}
function startTryingForFood(profile, categoryId, food, hasUnloggedToday, customDays) {
    if (getCurrentTryingCategoryId(profile))
        return null;
    const existing = profile.categoryAllergies[categoryId] || { state: 'untried' };
    const isInCategoryAdd = existing.state === 'open';
    const daysRequired = customDays || (isInCategoryAdd ? exports.TRYING_DAYS_INCATEGORY : exports.TRYING_DAYS_REQUIRED);
    const startDate = hasUnloggedToday
        ? formatDate(new Date())
        : formatDate(new Date(Date.now() + 86400000));
    profile.categoryAllergies[categoryId] = {
        ...existing,
        state: 'trying',
        tryingFood: food,
        tryingDaysRequired: daysRequired,
        tryingStartDate: startDate,
        tryingReplacedDates: []
    };
    return { profile, daysRequired, startDate, isInCategoryAdd };
}
function reconcileTryingReplaced(profile) {
    let mutated = false;
    for (const cat of Object.values(profile.categoryAllergies)) {
        if (cat.state !== 'trying' || !cat.tryingFood)
            continue;
        const replaced = cat.tryingReplacedDates || [];
        if (replaced.length === 0)
            continue;
        const journal = wx.getStorageSync('mealJournal') || [];
        const cleaned = replaced.filter(date => !journal.some(l => l.date === date && (l.ingredients || []).includes(cat.tryingFood)));
        if (cleaned.length !== replaced.length) {
            cat.tryingReplacedDates = cleaned;
            mutated = true;
        }
    }
    return mutated;
}
function reconcileExceptions(profile) {
    if (!profile.confirmedFoods || profile.confirmedFoods.length === 0)
        return false;
    let changed = false;
    for (const food of profile.confirmedFoods) {
        const ex = profile.individualExceptions[food];
        if (ex && ex.state === 'observation') {
            delete profile.individualExceptions[food];
            changed = true;
        }
    }
    return changed;
}
function recordTryingReplaced(profile, categoryId, date) {
    const cat = profile.categoryAllergies[categoryId];
    if (!cat || cat.state !== 'trying')
        return profile;
    const replaced = cat.tryingReplacedDates || [];
    if (!replaced.includes(date)) {
        cat.tryingReplacedDates = [...replaced, date];
    }
    return profile;
}
function isRecipeApplicable(recipe, profile, options = {}) {
    if (profile.ageMonths < recipe.applicableMonthRange[0]) {
        const confirmed = profile.confirmedFoods || [];
        const blockedByAge = recipe.ingredients.filter(i => {
            const ing = (0, ingredients_1.getIngredient)(i.name);
            return ing && profile.ageMonths < ing.applicableMonth;
        });
        const allOverridden = blockedByAge.length > 0 && blockedByAge.every(i => confirmed.includes(i.name));
        if (!allOverridden) {
            return { applicable: false, reason: `月龄不足(需${recipe.applicableMonthRange[0]}月+)` };
        }
    }
    if (profile.ageMonths > recipe.applicableMonthRange[1]) {
        return { applicable: false, reason: `超过适用月龄` };
    }
    if (recipe.unsuitableStatus.includes(profile.currentStatus)) {
        return { applicable: false, reason: `当前状态不适合` };
    }
    if (hasActiveGutReaction()) {
        if (recipe.unsuitableStatus.includes('gut') ||
            recipe.nutritionTags.some(t => ['DHA', '海鲜', '虾', '蟹', '高纤维'].includes(t))) {
            return { applicable: false, reason: '近期有肠胃反应未消退,避免海鲜/高纤维' };
        }
    }
    if (hasActiveConstipation()) {
        if (recipe.unsuitableStatus.includes('constipation') ||
            recipe.nutritionTags.some(t => ['低纤维', '精白米'].includes(t))) {
            return { applicable: false, reason: '便秘期间避免精米米糊/低纤维主食' };
        }
    }
    if (profile.currentStatus === 'postVaccine') {
        if (recipe.nutritionTags.some(t => ['DHA', '海鲜', '虾', '蟹'].includes(t))) {
            return { applicable: false, reason: '疫苗后避免海鲜/油脂' };
        }
    }
    for (const ing of recipe.ingredients) {
        if (options.introducing && ing.name === options.introducing)
            continue;
        const safety = isFoodSafeForBaby(ing.name, profile);
        if (!safety.safe)
            return { applicable: false, reason: safety.reason };
    }
    const ingredientNames = recipe.ingredients.map(i => i.name);
    const warnings = [];
    if (options.introducing) {
        const taboosAgainst = (0, taboos_1.findTaboosAgainst)(options.introducing, ingredientNames);
        for (const t of taboosAgainst) {
            if (t.level === 'hard') {
                return { applicable: false, reason: `排敏期禁忌:${t.reason}` };
            }
            if (t.level === 'soft') {
                if (!t.mitigation) {
                    return { applicable: false, reason: `排敏期影响吸收:${t.reason}` };
                }
                warnings.push(t);
            }
        }
        const baseOnly = ingredientNames.filter(n => n !== options.introducing);
        const baseTaboos = (0, taboos_1.findTaboosForIngredients)(baseOnly);
        const baseHard = baseTaboos.find(t => t.level === 'hard');
        if (baseHard) {
            return { applicable: false, reason: `食材搭配禁忌:${baseHard.reason}` };
        }
    }
    else {
        const taboos = (0, taboos_1.findTaboosForIngredients)(ingredientNames);
        const hard = taboos.find(t => t.level === 'hard');
        if (hard) {
            return { applicable: false, reason: `食材搭配禁忌:${hard.reason}` };
        }
    }
    return warnings.length > 0
        ? { applicable: true, warnings }
        : { applicable: true };
}
function getApplicableRecipes(profile) {
    return recipes_1.RECIPES.filter(r => isRecipeApplicable(r, profile).applicable);
}
function findIntroducingBases(target, profile, topN = 3) {
    return recipes_1.RECIPES
        .filter(r => !r.ingredients.some(i => i.name === target))
        .filter(r => isRecipeApplicable(r, profile, { introducing: target }).applicable)
        .slice(0, topN);
}
function getFirstTryMethod(foodName) {
    const cat = (0, categories_1.getCategoryByFood)(foodName);
    if (!cat)
        return '少量(1-2勺)单独尝试';
    if (cat.id === 'peanut')
        return '用无颗粒花生酱/花生粉调稀，从少量开始；禁止整粒花生';
    if (cat.id === 'nuts')
        return '用细磨坚果粉或无颗粒坚果酱调稀；禁止整粒坚果';
    if (cat.id === 'sesame')
        return '用芝麻酱调稀，从少量开始';
    if (cat.id === 'dairy')
        return '用巴氏杀菌原味酸奶等少量尝试；1岁内不以牛奶替代母乳或配方奶';
    if (cat.id === 'fish' || cat.id === 'shrimp' || cat.id === 'mollusc')
        return '彻底煮熟，仔细去刺/壳后压泥，从少量开始';
    switch (cat.mainCategory) {
        case 'protein':
            if (foodName.includes('蛋'))
                return '煮熟 1/4 个, 调稀';
            return '煮熟/蒸熟后压泥, 加 1 勺';
        case 'veg':
        case 'fruit':
            return '蒸熟搅泥, 加 1-2 勺';
        case 'staple':
            return '煮软/煮成糊, 加 1-2 勺';
        case 'oil':
        case 'condiment':
            return '少量(几滴)拌入';
        default:
            return '少量(1-2勺)单独尝试';
    }
}
function attachTrialIngredient(plans, date, mealIdx, target) {
    const method = getFirstTryMethod(target);
    const journal = wx.getStorageSync('mealJournal') || [];
    const loggedKeys = new Set(journal.map(l => `${l.date}-${l.mealIndex}`));
    return plans.map(p => ({
        ...p,
        meals: p.meals.map(m => {
            const key = `${p.date}-${m.mealIndex}`;
            if (loggedKeys.has(key))
                return m;
            if (m.trialIngredient === target && !(p.date === date && m.mealIndex === mealIdx)) {
                const { trialIngredient: _t, trialMethod: _m, ...rest } = m;
                return rest;
            }
            if (p.date === date && m.mealIndex === mealIdx) {
                return { ...m, trialIngredient: target, trialMethod: method };
            }
            return m;
        })
    }));
}
function clearTrialIngredient(plans, target) {
    const journal = wx.getStorageSync('mealJournal') || [];
    const loggedKeys = new Set(journal.map(l => `${l.date}-${l.mealIndex}`));
    return plans.map(p => ({
        ...p,
        meals: p.meals.map(m => {
            if (loggedKeys.has(`${p.date}-${m.mealIndex}`))
                return m;
            if (m.trialIngredient === target) {
                const { trialIngredient: _t, trialMethod: _m, ...rest } = m;
                return rest;
            }
            return m;
        })
    }));
}
function suggestTrialSlot(profile, target, plans, today, loggedKeys) {
    const sorted = plans
        .filter(p => p.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));
    for (const p of sorted) {
        for (let i = 0; i < p.meals.length; i++) {
            const m = p.meals[i];
            const key = `${p.date}-${m.mealIndex}`;
            if (loggedKeys.has(key))
                continue;
            if (m.recipe.ingredients.some(ing => ing.name === target))
                continue;
            const taboos = (0, taboos_1.findTaboosAgainst)(target, m.recipe.ingredients.map(ing => ing.name));
            if (taboos.some(t => t.level === 'hard' || (t.level === 'soft' && !t.mitigation)))
                continue;
            const warnings = taboos.filter(t => t.level === 'soft' && !!t.mitigation);
            return { date: p.date, mealIdx: m.mealIndex, recipeName: m.recipe.name, warnings };
        }
    }
    return null;
}
function getRecipeTabooWarnings(recipe, introducing) {
    const names = recipe.ingredients.map(i => i.name);
    if (introducing) {
        return (0, taboos_1.findTaboosAgainst)(introducing, names).filter(t => t.level === 'soft' && !!t.mitigation);
    }
    return (0, taboos_1.findTaboosForIngredients)(names).filter(t => t.level === 'soft' && !!t.mitigation);
}
function diagnoseEmptyPlan(profile) {
    if (profile.ageMonths < 4) {
        return {
            reason: '宝宝还没到辅食月龄,建议 4-6 月龄再开始添加',
            action: '先以奶为主,等到 4 月龄后再回来',
            actionType: 'wait'
        };
    }
    const opened = Object.values(profile.categoryAllergies).filter(c => c.state === 'open' || c.state === 'trying');
    const openedCount = opened.length;
    if (profile.ageMonths < 6 && openedCount === 0) {
        return {
            reason: '4-5 月龄可以开始尝试,推荐第一口高铁米粉',
            action: '去排敏档案点"高铁米粉",开始 3 天排敏',
            actionType: 'profile'
        };
    }
    if (openedCount === 0) {
        return {
            reason: '排敏档案里还没有任何已开放的食物',
            action: '去排敏档案勾选已经稳定吃过的食物',
            actionType: 'profile'
        };
    }
    if (openedCount < 2) {
        return {
            reason: `已开放品类太少(只有 ${openedCount} 类),不够组合菜单`,
            action: '去排敏档案多勾选几个品类,或者点"立即引入"试一个新的',
            actionType: 'profile'
        };
    }
    const applicable = getApplicableRecipes(profile);
    if (applicable.length === 0) {
        return {
            reason: `${profile.ageMonths} 月龄的宝宝当前安全清单凑不出现成食谱`,
            action: '试试食谱库手动浏览(可看不安全的),或多开放几个品类',
            actionType: 'recipes'
        };
    }
    return {
        reason: '系统暂时凑不出菜单',
        action: '试试调整餐次或重新生成',
        actionType: 'wait'
    };
}
function getPreferenceWeights() {
    const journal = wx.getStorageSync('mealJournal') || [];
    const weights = {};
    for (const log of journal.slice(-30)) {
        if (!log.recipeId)
            continue;
        if (log.preference === 'love')
            weights[log.recipeId] = (weights[log.recipeId] || 0) + 5;
        if (log.preference === 'dislike')
            weights[log.recipeId] = (weights[log.recipeId] || 0) - 8;
    }
    return weights;
}
function pickByCoverage(applicable, recentIds, requiredCategories, prefWeights = {}, todayCovered = new Set(), todayIngredients = new Set()) {
    const candidates = applicable.filter(r => !recentIds.slice(-5).includes(r.id));
    const pool = candidates.length > 0 ? candidates : applicable;
    const stillNeeded = requiredCategories.filter(c => !todayCovered.has(c));
    const mustHave = new Set(['staple']);
    const scored = pool.map(r => {
        let score = 0;
        for (const cat of stillNeeded) {
            if (r.mealCategories.includes(cat))
                score += 12;
        }
        if (mustHave.has('staple') && r.mealCategories.includes('staple'))
            score += 8;
        if (stillNeeded.length === 0) {
            score += r.mealCategories.length * 3;
        }
        else {
            const overlap = r.mealCategories.filter(c => todayCovered.has(c) && !stillNeeded.includes(c)).length;
            score -= overlap * 2;
        }
        const ingredientOverlap = r.ingredients.filter(i => todayIngredients.has(i.name)).length;
        score -= ingredientOverlap * 6;
        score += (prefWeights[r.id] || 0);
        score += Math.random() * 4;
        return { r, score };
    }).sort((a, b) => b.score - a.score);
    return scored[0]?.r || null;
}
function generateWeeklyPlan(profile, days = 7, startDate) {
    const start = startDate || new Date();
    const applicable = getApplicableRecipes(profile);
    if (applicable.length === 0)
        return [];
    const tryingFood = getTryingFood(profile);
    const recipesWithTrying = tryingFood
        ? applicable.filter(r => r.ingredients.some(i => i.name === tryingFood))
        : [];
    let tryingStartTs = 0;
    let tryingDaysRequired = exports.TRYING_DAYS_REQUIRED;
    if (tryingFood) {
        for (const cat of Object.values(profile.categoryAllergies)) {
            if (cat.state === 'trying' && cat.tryingFood === tryingFood && cat.tryingStartDate) {
                tryingStartTs = parseLocalDate(cat.tryingStartDate);
                const replacedCount = (cat.tryingReplacedDates || []).length;
                tryingDaysRequired = getTryingDaysFor(cat) + replacedCount;
                break;
            }
        }
    }
    const recentRecipeIds = [];
    const plan = [];
    const ironCountByWeek = {};
    const dhaCountByWeek = {};
    const organCountByWeek = {};
    const ORGAN_LIMIT_PER_WEEK = 1;
    const prefWeights = getPreferenceWeights();
    for (let d = 0; d < days; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + d);
        const dateStr = formatDate(date);
        const weekKey = `${Math.floor(d / 7)}`;
        if (!ironCountByWeek[weekKey])
            ironCountByWeek[weekKey] = 0;
        if (!dhaCountByWeek[weekKey])
            dhaCountByWeek[weekKey] = 0;
        if (!organCountByWeek[weekKey])
            organCountByWeek[weekKey] = 0;
        const dayOffset = tryingStartTs > 0
            ? Math.round((parseLocalDate(dateStr) - tryingStartTs) / 86400000)
            : -1;
        const isTryingDay = !!tryingFood && dayOffset >= 0 && dayOffset < tryingDaysRequired;
        const meals = [];
        let tryingPlacedToday = false;
        const todayCovered = new Set();
        const todayIngredients = new Set();
        const nutritionRule = (0, nutrition_1.getNutritionRule)(profile.ageMonths);
        for (let m = 0; m < profile.mealsPerDay; m++) {
            const required = [...nutritionRule.required];
            if (ironCountByWeek[weekKey] < nutritionRule.ironRichPerWeek - 3)
                required.push('protein');
            if (dhaCountByWeek[weekKey] < nutritionRule.dhaSourcesPerWeek)
                required.push('protein');
            let basePool = applicable;
            if (organCountByWeek[weekKey] >= ORGAN_LIMIT_PER_WEEK) {
                basePool = basePool.filter(r => !r.nutritionTags.some(t => t === '内脏'));
            }
            let pool = basePool;
            if (isTryingDay && !tryingPlacedToday && m === 0 && recipesWithTrying.length > 0) {
                pool = recipesWithTrying;
            }
            else if (isTryingDay && !tryingPlacedToday && m === profile.mealsPerDay - 1 && recipesWithTrying.length > 0) {
                pool = recipesWithTrying;
            }
            else if (isTryingDay && tryingPlacedToday && tryingFood) {
                const withoutTrying = pool.filter(r => !r.ingredients.some(i => i.name === tryingFood));
                if (withoutTrying.length > 0)
                    pool = withoutTrying;
            }
            if (!isTryingDay) {
                const eligible = pool.filter(r => (0, nutrition_1.meetsRequired)(r.mealCategories, nutritionRule));
                if (eligible.length >= 3) {
                    pool = eligible;
                }
            }
            const pick = pickByCoverage(pool, recentRecipeIds, required, prefWeights, todayCovered, todayIngredients);
            if (!pick)
                continue;
            recentRecipeIds.push(pick.id);
            pick.mealCategories.forEach(c => todayCovered.add(c));
            pick.ingredients.forEach(i => todayIngredients.add(i.name));
            if (pick.nutritionTags.some(t => t === '铁'))
                ironCountByWeek[weekKey]++;
            if (pick.nutritionTags.some(t => t === 'DHA'))
                dhaCountByWeek[weekKey]++;
            if (pick.nutritionTags.some(t => t === '内脏'))
                organCountByWeek[weekKey]++;
            if (tryingFood && pick.ingredients.some(i => i.name === tryingFood)) {
                tryingPlacedToday = true;
            }
            meals.push({ date: dateStr, mealIndex: m, recipe: pick });
        }
        plan.push({ date: dateStr, meals });
    }
    return plan;
}
function pickReplacement(profile, dayPlan, mealIdx) {
    const applicable = getApplicableRecipes(profile);
    const targetPosition = dayPlan.meals.findIndex(meal => meal.mealIndex === mealIdx);
    if (targetPosition < 0)
        return null;
    const oldRecipe = dayPlan.meals[targetPosition].recipe;
    const candidates = applicable.filter(r => r.id !== oldRecipe.id);
    if (candidates.length === 0)
        return null;
    const otherCovered = new Set();
    const otherIngredients = new Set();
    for (let i = 0; i < dayPlan.meals.length; i++) {
        if (i === targetPosition)
            continue;
        const m = dayPlan.meals[i];
        m.recipe.mealCategories.forEach(c => otherCovered.add(c));
        m.recipe.ingredients.forEach(ing => otherIngredients.add(ing.name));
    }
    const rule = (0, nutrition_1.getNutritionRule)(profile.ageMonths);
    const tryingFood = getTryingFood(profile);
    const isTryingDay = !!tryingFood;
    const oldUsesTrying = !!(tryingFood && oldRecipe.ingredients.some(i => i.name === tryingFood));
    let pool = candidates;
    if (!isTryingDay) {
        const eligible = pool.filter(r => (0, nutrition_1.meetsRequired)(r.mealCategories, rule));
        if (eligible.length >= 3)
            pool = eligible;
    }
    if (tryingFood) {
        if (oldUsesTrying) {
            const tryingPool = pool.filter(r => r.ingredients.some(i => i.name === tryingFood));
            if (tryingPool.length > 0)
                pool = tryingPool;
        }
        else {
            const withoutTrying = pool.filter(r => !r.ingredients.some(i => i.name === tryingFood));
            if (withoutTrying.length > 0)
                pool = withoutTrying;
        }
    }
    const required = [...rule.required];
    return pickByCoverage(pool, [], required, getPreferenceWeights(), otherCovered, otherIngredients);
}
function pickReplacementCandidates(profile, dayPlan, mealIdx, topN = 3, fridgeNames, excludeIds) {
    const applicable = getApplicableRecipes(profile);
    const targetPosition = dayPlan.meals.findIndex(meal => meal.mealIndex === mealIdx);
    if (targetPosition < 0)
        return [];
    const oldRecipe = dayPlan.meals[targetPosition].recipe;
    let candidates = applicable.filter(r => r.id !== oldRecipe.id);
    if (candidates.length === 0)
        return [];
    if (excludeIds && excludeIds.length > 0) {
        const fresh = candidates.filter(r => !excludeIds.includes(r.id));
        if (fresh.length >= topN)
            candidates = fresh;
    }
    const otherCovered = new Set();
    const otherIngredients = new Set();
    for (let i = 0; i < dayPlan.meals.length; i++) {
        if (i === targetPosition)
            continue;
        const m = dayPlan.meals[i];
        m.recipe.mealCategories.forEach(c => otherCovered.add(c));
        m.recipe.ingredients.forEach(ing => otherIngredients.add(ing.name));
    }
    const rule = (0, nutrition_1.getNutritionRule)(profile.ageMonths);
    const tryingFood = getTryingFood(profile);
    const isTryingDay = !!tryingFood;
    let pool = candidates;
    if (!isTryingDay) {
        const eligible = pool.filter(r => (0, nutrition_1.meetsRequired)(r.mealCategories, rule));
        if (eligible.length >= topN)
            pool = eligible;
    }
    const required = [...rule.required];
    const stillNeeded = required.filter(c => !otherCovered.has(c));
    const oldUsesTrying = !!(tryingFood && oldRecipe.ingredients.some(i => i.name === tryingFood));
    if (isTryingDay && tryingFood) {
        if (oldUsesTrying) {
            const tryingOnly = pool.filter(r => r.ingredients.some(i => i.name === tryingFood));
            if (tryingOnly.length >= 1)
                pool = tryingOnly;
        }
        else {
            const withoutTrying = pool.filter(r => !r.ingredients.some(i => i.name === tryingFood));
            if (withoutTrying.length >= 1)
                pool = withoutTrying;
        }
    }
    const scored = pool.map(r => {
        let score = 0;
        for (const cat of stillNeeded) {
            if (r.mealCategories.includes(cat))
                score += 12;
        }
        if (r.mealCategories.includes('staple'))
            score += 8;
        if (stillNeeded.length === 0) {
            score += r.mealCategories.length * 3;
        }
        else {
            const overlap = r.mealCategories.filter(c => otherCovered.has(c) && !stillNeeded.includes(c)).length;
            score -= overlap * 2;
        }
        const ingredientOverlap = r.ingredients.filter(i => otherIngredients.has(i.name)).length;
        score -= ingredientOverlap * 6;
        if (fridgeNames) {
            const fromFridge = r.ingredients.filter(i => fridgeNames.has(i.name)).length;
            score += fromFridge * 4;
        }
        const isTryingMeal = !!(tryingFood && r.ingredients.some(i => i.name === tryingFood));
        if (isTryingDay && isTryingMeal) {
            score += oldUsesTrying ? 50 : 28;
        }
        score += Math.random() * 3;
        return { r, score };
    }).sort((a, b) => b.score - a.score);
    const recentIds = new Set();
    try {
        const allPlans = wx.getStorageSync('weeklyPlan') || [];
        const today = new Date();
        const cutoff = formatDate(new Date(today.getTime() - 3 * 86400000));
        const todayStr = formatDate(today);
        for (const day of allPlans) {
            if (day.date >= cutoff && day.date <= todayStr) {
                for (const m of day.meals)
                    recentIds.add(m.recipe.id);
            }
        }
    }
    catch (_e) { }
    return scored.slice(0, topN).map(({ r }) => {
        const inFridgeIngredients = fridgeNames
            ? r.ingredients.filter(i => fridgeNames.has(i.name))
            : [];
        const inFridgeCount = inFridgeIngredients.length;
        const inFridgeAll = !!fridgeNames && r.ingredients.length > 0 && inFridgeCount === r.ingredients.length;
        return {
            recipe: r,
            reason: genReplacementReason(r, stillNeeded, fridgeNames, otherIngredients),
            reasons: genReplacementReasons(r, stillNeeded, fridgeNames, otherIngredients, recentIds, tryingFood),
            prepTime: r.prepTimeMinutes,
            inFridgeAll,
            inFridgeCount,
            warnings: tryingFood ? getRecipeTabooWarnings(r, tryingFood) : []
        };
    });
}
function genReplacementReasons(recipe, stillNeeded, fridgeNames, otherIngredients, recentIds, tryingFood) {
    const out = [];
    const catLabel = { staple: '主食', protein: '蛋白', veg: '蔬菜', fruit: '水果' };
    if (fridgeNames) {
        const inFridge = recipe.ingredients.filter(i => fridgeNames.has(i.name));
        if (recipe.ingredients.length > 0 && inFridge.length === recipe.ingredients.length) {
            out.push({ icon: '✅', text: '冰箱已有全部食材' });
        }
        else if (inFridge.length > 0) {
            out.push({ icon: '✅', text: `冰箱已有 ${inFridge.length} 种食材` });
        }
    }
    const fills = recipe.mealCategories.filter(c => stillNeeded.includes(c));
    if (fills.length > 0) {
        out.push({ icon: '✅', text: `补今日缺的${fills.map(c => catLabel[c] || c).join('+')}` });
    }
    const ingredientOverlap = recipe.ingredients.filter(i => otherIngredients.has(i.name)).length;
    if (ingredientOverlap === 0 && recipe.ingredients.length > 0) {
        out.push({ icon: '✅', text: '与其他餐不重复' });
    }
    if (recipe.id && !recentIds.has(recipe.id)) {
        out.push({ icon: '✅', text: '最近 3 天未重复' });
    }
    if (tryingFood && !recipe.ingredients.some(i => i.name === tryingFood)) {
        out.push({ icon: '✅', text: '非新食材，更稳妥' });
    }
    return out;
}
function genReplacementReason(recipe, stillNeeded, fridgeNames, _otherIngredients) {
    const catLabel = { staple: '主食', protein: '蛋白', veg: '蔬菜', fruit: '水果' };
    const fills = recipe.mealCategories.filter(c => stillNeeded.includes(c));
    if (fills.length > 0) {
        return `💡 补${fills.map(c => catLabel[c] || c).join('+')}`;
    }
    if (fridgeNames) {
        const used = recipe.ingredients.map(i => i.name).filter(n => fridgeNames.has(n));
        if (used.length > 0)
            return `🧊 用冰箱里的${used[0]}`;
    }
    const goodTags = recipe.nutritionTags.filter(t => ['DHA', '铁', '钙', '蛋白'].includes(t));
    if (goodTags.length > 0)
        return `🥗 补${goodTags[0]}`;
    return '🍽 搭配均衡';
}
function regenerateFromToday(profile, existingPlan) {
    const today = formatDate(new Date());
    const past = existingPlan.filter(p => p.date < today);
    const todayAndFuture = existingPlan.filter(p => p.date >= today);
    const days = todayAndFuture.length || 7;
    const startDate = todayAndFuture.length > 0 ? new Date(todayAndFuture[0].date) : new Date();
    const newFuturePlan = generateWeeklyPlan(profile, days, startDate);
    return [...past, ...newFuturePlan];
}
function preserveLoggedMealFacts(existingPlan, proposedPlan) {
    const journal = wx.getStorageSync('mealJournal') || [];
    const loggedKeys = new Set(journal.map(l => `${l.date}-${l.mealIndex}`));
    if (loggedKeys.size === 0)
        return proposedPlan;
    const nextPlan = proposedPlan.map(day => ({ ...day, meals: [...day.meals] }));
    for (const oldDay of existingPlan) {
        const loggedMeals = oldDay.meals.filter(meal => loggedKeys.has(`${oldDay.date}-${meal.mealIndex}`));
        if (loggedMeals.length === 0)
            continue;
        let nextDay = nextPlan.find(day => day.date === oldDay.date);
        if (!nextDay) {
            nextDay = { ...oldDay, meals: [] };
            nextPlan.push(nextDay);
        }
        for (const oldMeal of loggedMeals) {
            const nextIndex = nextDay.meals.findIndex(meal => meal.mealIndex === oldMeal.mealIndex);
            if (nextIndex >= 0)
                nextDay.meals[nextIndex] = oldMeal;
            else
                nextDay.meals.push(oldMeal);
        }
        nextDay.meals.sort((left, right) => left.mealIndex - right.mealIndex);
    }
    return nextPlan.sort((left, right) => left.date.localeCompare(right.date));
}
function regenerateTomorrowOnward(profile, existingPlan) {
    const today = formatDate(new Date());
    const tomorrowMs = parseLocalDate(today) + 86400000;
    const tomorrow = formatDate(new Date(tomorrowMs));
    const keep = existingPlan.filter(p => p.date <= today);
    const oldFuture = existingPlan.filter(p => p.date >= tomorrow);
    const futureDays = oldFuture.length || 6;
    const newFuture = generateWeeklyPlan(profile, futureDays, new Date(tomorrowMs));
    for (const oldDay of oldFuture) {
        const newDay = newFuture.find(p => p.date === oldDay.date);
        if (!newDay)
            continue;
        for (const oldMeal of oldDay.meals) {
            if (!oldMeal.trialIngredient)
                continue;
            const newMeal = newDay.meals[oldMeal.mealIndex];
            if (newMeal && !newMeal.trialIngredient) {
                newMeal.trialIngredient = oldMeal.trialIngredient;
                newMeal.trialMethod = oldMeal.trialMethod;
            }
        }
    }
    return [...keep, ...newFuture];
}
function regenerateKeepingLoggedToday(profile, existingPlan) {
    const today = formatDate(new Date());
    const journal = wx.getStorageSync('mealJournal') || [];
    const loggedIdx = new Set(journal.filter(l => l.date === today).map(l => l.mealIndex));
    const newPlan = preserveLoggedMealFacts(existingPlan, regenerateFromToday(profile, existingPlan));
    const todayIdx = newPlan.findIndex(p => p.date === today);
    for (const oldDay of existingPlan) {
        const newDay = newPlan.find(p => p.date === oldDay.date);
        if (!newDay)
            continue;
        for (const oldMeal of oldDay.meals) {
            if (!oldMeal.trialIngredient)
                continue;
            const newMeal = newDay.meals.find(meal => meal.mealIndex === oldMeal.mealIndex);
            const stillSafeToTry = isFoodSafeForBaby(oldMeal.trialIngredient, profile).safe;
            if (newMeal && !newMeal.trialIngredient && stillSafeToTry) {
                newMeal.trialIngredient = oldMeal.trialIngredient;
                newMeal.trialMethod = oldMeal.trialMethod;
            }
        }
    }
    if (todayIdx >= 0) {
        const tryingFood = getTryingFood(profile);
        if (tryingFood) {
            const meals = newPlan[todayIdx].meals;
            const hasIt = meals.some(m => m.recipe.ingredients.some(i => i.name === tryingFood));
            if (!hasIt) {
                const applicable = getApplicableRecipes(profile);
                const candidates = applicable.filter(r => r.ingredients.some(i => i.name === tryingFood));
                if (candidates.length > 0) {
                    for (let i = 0; i < meals.length; i++) {
                        if (!loggedIdx.has(meals[i].mealIndex)) {
                            meals[i] = { ...meals[i], recipe: candidates[Math.floor(Math.random() * candidates.length)] };
                            break;
                        }
                    }
                }
            }
        }
    }
    return newPlan;
}
function rebuildPlanPreservingLoggedMeals(profile) {
    const existingPlan = wx.getStorageSync('weeklyPlan') || [];
    if (existingPlan.length === 0)
        return existingPlan;
    const nextPlan = regenerateKeepingLoggedToday(profile, existingPlan);
    wx.setStorageSync('weeklyPlan', nextPlan);
    return nextPlan;
}
function formatDate(d) {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
function getWeekday(dateStr) {
    const parts = dateStr.slice(0, 10).split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    }
    const d = new Date(dateStr);
    return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
}
function getNextRecommendation(profile) {
    if (profile.currentStatus === 'postVaccine')
        return [];
    if (hasActiveGutReaction())
        return [];
    if (getCurrentTryingCategoryId(profile)) {
        return [];
    }
    const confirmed = profile.confirmedFoods || [];
    const recommendations = [];
    for (const cat of categories_1.CATEGORIES) {
        const status = profile.categoryAllergies[cat.id];
        if (!status || status.state !== 'untried')
            continue;
        if (cat.recommendedMonth > profile.ageMonths)
            continue;
        if (cat.representatives.length === 0)
            continue;
        let priority = 100 - cat.recommendedMonth;
        if (cat.riskLevel === 'low')
            priority += 10;
        if (cat.commonAllergen)
            priority += 8;
        let reason = `${cat.name}建议${cat.recommendedMonth}月+引入`;
        if (cat.commonAllergen)
            reason += '，属于常见过敏原，一次只引入一种';
        recommendations.push({
            categoryId: cat.id,
            category: cat.name,
            reason,
            suggestedFoods: (0, categories_1.getPrimaryMembers)(cat.id),
            firstFood: cat.representatives[0] || (0, categories_1.getPrimaryMembers)(cat.id)[0],
            mode: 'newCategory',
            daysRequired: exports.TRYING_DAYS_REQUIRED,
            priority
        });
    }
    for (const cat of categories_1.CATEGORIES) {
        if (cat.noAllergyTracking)
            continue;
        const status = profile.categoryAllergies[cat.id];
        if (!status || status.state !== 'open')
            continue;
        const unconfirmed = (0, categories_1.getPrimaryMembers)(cat.id).filter(m => !confirmed.includes(m) && m !== status.representative);
        if (unconfirmed.length === 0)
            continue;
        let priority = 50 - cat.recommendedMonth;
        if (cat.riskLevel === 'low')
            priority += 5;
        recommendations.push({
            categoryId: cat.id,
            category: cat.name,
            reason: `已通过${status.representative || '某成员'}，下一种食物仍需单独观察`,
            suggestedFoods: unconfirmed,
            firstFood: unconfirmed[0],
            mode: 'newFoodInOpenCategory',
            daysRequired: exports.TRYING_DAYS_INCATEGORY,
            priority
        });
    }
    return recommendations.sort((a, b) => b.priority - a.priority).slice(0, 5)
        .map(({ priority, ...rest }) => rest);
}
function aggregateShoppingList(plan) {
    const map = {};
    for (const day of plan) {
        for (const meal of day.meals) {
            for (const ing of meal.recipe.ingredients) {
                map[ing.name] = (map[ing.name] || 0) + ing.portions;
            }
        }
    }
    return Object.entries(map).map(([name, portions]) => ({ name, portions }));
}
function aggregateShoppingListForFutureDays(plan, days) {
    const today = formatDate(new Date());
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const targetStr = formatDate(targetDate);
    const journal = wx.getStorageSync('mealJournal') || [];
    const todayLoggedIdx = new Set(journal.filter((l) => l.date === today).map((l) => l.mealIndex));
    const map = {};
    for (const day of plan) {
        if (day.date < today || day.date >= targetStr)
            continue;
        for (const meal of day.meals) {
            if (day.date === today && todayLoggedIdx.has(meal.mealIndex))
                continue;
            for (const ing of meal.recipe.ingredients) {
                map[ing.name] = (map[ing.name] || 0) + ing.portions;
            }
        }
    }
    return Object.entries(map).map(([name, portions]) => ({ name, portions }));
}
