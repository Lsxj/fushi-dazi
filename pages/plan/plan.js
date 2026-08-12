"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const planner_1 = require("../../utils/planner");
const dateUtil_1 = require("../../utils/dateUtil");
const storage_1 = require("../../utils/storage");
const categories_1 = require("../../data/categories");
function getNextMonday() {
    const today = new Date();
    const dow = today.getDay();
    const daysUntilMonday = ((1 - dow) + 7) % 7 || 7;
    const d = new Date(today);
    d.setDate(today.getDate() + daysUntilMonday);
    return d;
}
Page({
    data: {
        plan: [],
        mealsPerDay: 0,
        shopDays: 7,
        shoppingList: [],
        shoppingGroups: [],
        previewVisible: false,
        previewStart: '',
        previewEnd: '',
        previewRangeLabel: '',
        previewPlan: []
    },
    onShow() {
        const savedDays = wx.getStorageSync('shopDays') || 7;
        this.setData({ shopDays: savedDays });
        this.refresh();
    },
    refresh() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const DESIRED_DAYS = 7;
        const todayStr = (0, planner_1.formatDate)(new Date());
        let plan = wx.getStorageSync('weeklyPlan') || [];
        plan = plan.filter(p => p.date >= todayStr);
        if (plan.length < DESIRED_DAYS) {
            const startMs = plan.length > 0
                ? (0, dateUtil_1.parseLocalDateMs)(plan[plan.length - 1].date) + 86400000
                : (0, dateUtil_1.parseLocalDateMs)(todayStr);
            const needDays = DESIRED_DAYS - plan.length;
            const appended = (0, planner_1.generateWeeklyPlan)(profile, needDays, new Date(startMs));
            plan = [...plan, ...appended];
        }
        wx.setStorageSync('weeklyPlan', plan);
        const journal = wx.getStorageSync('mealJournal') || [];
        const loggedSet = new Set(journal.map((l) => `${l.date}-${l.mealIndex}`));
        const enriched = plan.map(d => ({
            ...d,
            dateLabel: this.shortDate(d.date),
            weekday: (0, planner_1.getWeekday)(d.date),
            meals: d.meals.map(m => ({
                ...m,
                ingredientsText: m.recipe.ingredients.map(i => `${i.name} ${i.portions}份`).join(' + '),
                logged: loggedSet.has(`${d.date}-${m.mealIndex}`)
            }))
        }));
        const fridgeMap = {};
        for (const f of (0, storage_1.getFridge)()) {
            fridgeMap[f.name] = (fridgeMap[f.name] || 0) + f.portions;
        }
        const allNeeded = (0, planner_1.aggregateShoppingListForFutureDays)(plan, this.data.shopDays);
        const autoRows = allNeeded
            .map(item => {
            const have = fridgeMap[item.name] || 0;
            return {
                name: item.name,
                needed: item.portions,
                haveInFridge: have,
                toBuy: Math.max(0, item.portions - have)
            };
        })
            .filter(item => item.toBuy > 0);
        const manualMap = {};
        for (const m of (0, storage_1.getManualShopList)()) {
            manualMap[m.name] = (manualMap[m.name] || 0) + m.portions;
        }
        const shopMap = {};
        autoRows.forEach(r => { shopMap[r.name] = r; });
        for (const [name, p] of Object.entries(manualMap)) {
            if (shopMap[name]) {
                shopMap[name].needed += p;
                shopMap[name].toBuy += p;
            }
            else {
                shopMap[name] = {
                    name,
                    needed: p,
                    haveInFridge: fridgeMap[name] || 0,
                    toBuy: p
                };
            }
        }
        const shopping = Object.values(shopMap);
        const groupMap = {};
        for (const item of shopping) {
            const area = (0, categories_1.getShopAreaForFood)(item.name);
            if (!groupMap[area])
                groupMap[area] = [];
            groupMap[area].push(item);
        }
        const AREA_ORDER = ['蔬果区', '肉禽鱼蛋区', '主食/谷物区', '速冻/熟食区', '调料/油区', '婴幼儿食品区', '其他'];
        const shoppingGroups = AREA_ORDER
            .filter(a => groupMap[a])
            .map(area => ({ area, items: groupMap[area] }));
        this.setData({
            plan: enriched,
            mealsPerDay: profile.mealsPerDay,
            shoppingList: shopping,
            shoppingGroups
        });
    },
    shortDate(dateStr) {
        const parts = dateStr.split('-');
        return `${parts[1]}/${parts[2]}`;
    },
    setShopDays(e) {
        const days = parseInt(e.currentTarget.dataset.days, 10);
        wx.setStorageSync('shopDays', days);
        this.setData({ shopDays: days });
        this.refresh();
    },
    regenerate() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const existing = wx.getStorageSync('weeklyPlan') || [];
        const plan = existing.length > 0
            ? (0, planner_1.regenerateKeepingLoggedToday)(profile, existing)
            : (0, planner_1.generateWeeklyPlan)(profile, 7);
        wx.setStorageSync('weeklyPlan', plan);
        wx.showToast({ title: '已重新生成', icon: 'success' });
        this.refresh();
    },
    openRecipe(e) {
        const id = e.currentTarget.dataset.id;
        if (id)
            wx.navigateTo({ url: `/pages/recipe/recipe?id=${id}` });
    },
    replaceMeal(e) {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const date = e.currentTarget.dataset.date;
        const idx = e.currentTarget.dataset.idx;
        const plan = wx.getStorageSync('weeklyPlan') || [];
        const day = plan.find(p => p.date === date);
        if (!day)
            return;
        const journal = wx.getStorageSync('mealJournal') || [];
        const isLogged = journal.some((l) => l.date === date && l.mealIndex === idx);
        if (isLogged) {
            wx.showToast({ title: '这餐已经喂完了，无法替换', icon: 'none', duration: 1400 });
            return;
        }
        const tryingFood = (0, planner_1.getTryingFood)(profile);
        const targetMeal = day.meals.find(meal => meal.mealIndex === idx);
        if (!targetMeal)
            return;
        const oldRecipe = targetMeal.recipe;
        const oldUsesTrying = !!(tryingFood && oldRecipe.ingredients.some(i => i.name === tryingFood));
        const todayAlreadyAteTrying = !!(tryingFood && journal.some(l => l.date === date && (l.ingredients || []).includes(tryingFood)));
        const otherMealsHaveTrying = !!(tryingFood && day.meals.some(m => m.mealIndex !== idx && m.recipe.ingredients.some(ing => ing.name === tryingFood)));
        const replacement = (0, planner_1.pickReplacement)(profile, day, idx);
        if (!replacement) {
            wx.showToast({ title: '暂无其他营养均衡的食谱', icon: 'none', duration: 1400 });
            return;
        }
        const newRecipeHasTrying = !!(tryingFood && replacement.ingredients.some(i => i.name === tryingFood));
        const willStillHaveTryingAfter = newRecipeHasTrying || otherMealsHaveTrying;
        const doReplace = () => {
            targetMeal.recipe = replacement;
            const stillHasTrying = day.meals.some(m => m.recipe.ingredients.some(ing => ing.name === tryingFood));
            if (oldUsesTrying && !todayAlreadyAteTrying && !stillHasTrying && tryingFood) {
                const tryingCatId = (0, planner_1.getCurrentTryingCategoryId)(profile);
                if (tryingCatId) {
                    const updated = (0, planner_1.recordTryingReplaced)(profile, tryingCatId, date);
                    wx.setStorageSync('babyProfile', updated);
                }
            }
            wx.setStorageSync('weeklyPlan', plan);
            wx.showToast({ title: '已替换', icon: 'success' });
            this.refresh();
        };
        if (oldUsesTrying && !todayAlreadyAteTrying && !willStillHaveTryingAfter) {
            wx.showModal({
                title: '替换会延长观察期',
                content: `这一顿包含正在排敏的 ${tryingFood},替换后这天不算排敏天,观察期会延长 1 天。继续吗?`,
                success: (res) => { if (res.confirm)
                    doReplace(); }
            });
        }
        else {
            doReplace();
        }
    },
    markHave(e) {
        const name = e.currentTarget.dataset.name;
        (0, storage_1.quickAddFridgeItem)(name, 1);
        (0, storage_1.removeFromManualShopList)(name);
        wx.showToast({ title: `+1 份入冰箱`, icon: 'success', duration: 700 });
        this.refresh();
    },
    markHaveMore(e) {
        const name = e.currentTarget.dataset.name;
        (0, storage_1.quickAddFridgeItem)(name, 1);
        (0, storage_1.removeFromManualShopList)(name);
        wx.showToast({ title: `+1 份入冰箱`, icon: 'none', duration: 500 });
        this.refresh();
    },
    copyFullPlan() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        let text = `📅 ${profile.babyName}的本周辅食计划\n${profile.ageMonths}月龄 · 每日${profile.mealsPerDay}顿\n\n`;
        for (const day of this.data.plan) {
            text += `【${day.dateLabel} 周${day.weekday}】\n`;
            for (const meal of day.meals) {
                text += `第${meal.mealIndex + 1}餐:${meal.recipe.name}\n`;
                text += `  食材:${meal.ingredientsText}\n`;
            }
            text += '\n';
        }
        if (this.data.shoppingGroups.length > 0) {
            text += `🛒 采购清单(未来${this.data.shopDays}天)\n`;
            for (const g of this.data.shoppingGroups) {
                text += `\n【${g.area}】\n`;
                text += g.items.map(i => `  • ${i.name} ${i.toBuy}份`).join('\n') + '\n';
            }
        }
        text += `\n— 来自辅食搭子`;
        wx.setClipboardData({
            data: text,
            success: () => {
                wx.showToast({ title: '已复制完整周计划', icon: 'success' });
            }
        });
    },
    openPreview() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const start = getNextMonday();
        this.buildPreview(profile, start);
        this.setData({ previewVisible: true });
    },
    closePreview() {
        this.setData({ previewVisible: false });
    },
    buildPreview(profile, startDate) {
        const preview = (0, planner_1.generateWeeklyPlan)(profile, 7, startDate);
        const end = new Date(startDate);
        end.setDate(startDate.getDate() + 6);
        const startStr = (0, planner_1.formatDate)(startDate);
        const endStr = (0, planner_1.formatDate)(end);
        const previewPlan = preview.map(d => ({
            date: d.date,
            dateLabel: this.shortDate(d.date),
            weekday: (0, planner_1.getWeekday)(d.date),
            meals: d.meals.map(m => ({
                mealIndex: m.mealIndex,
                recipe: m.recipe,
                ingredientsText: m.recipe.ingredients.map(i => `${i.name} ${i.portions}份`).join(' + ')
            }))
        }));
        this.setData({
            previewStart: startStr,
            previewEnd: endStr,
            previewRangeLabel: `${this.shortDate(startStr)} - ${this.shortDate(endStr)}`,
            previewPlan
        });
    },
    shiftPreview(e) {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile || !this.data.previewStart)
            return;
        const dir = e.currentTarget.dataset.dir;
        const offset = dir === 'next' ? 7 : -7;
        const start = new Date((0, dateUtil_1.parseLocalDateMs)(this.data.previewStart));
        start.setDate(start.getDate() + offset);
        this.buildPreview(profile, start);
    },
    regeneratePreview() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile || !this.data.previewStart)
            return;
        const start = new Date((0, dateUtil_1.parseLocalDateMs)(this.data.previewStart));
        this.buildPreview(profile, start);
        wx.showToast({ title: '已换一组', icon: 'success', duration: 800 });
    },
    copyPreview() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        let text = `📅 ${profile.babyName} 下周辅食预览\n${this.data.previewRangeLabel} · ${profile.ageMonths}月龄 · 每日${profile.mealsPerDay}顿\n\n`;
        for (const day of this.data.previewPlan) {
            text += `【${day.dateLabel} 周${day.weekday}】\n`;
            for (const meal of day.meals) {
                text += `第${meal.mealIndex + 1}餐:${meal.recipe.name}\n`;
                text += `  食材:${meal.ingredientsText}\n`;
            }
            text += '\n';
        }
        text += `(此为预览,未保存为正式计划)\n— 来自辅食搭子`;
        wx.setClipboardData({
            data: text,
            success: () => {
                wx.showToast({ title: '已复制', icon: 'success' });
            }
        });
    },
    noop() { },
    copyShoppingList() {
        const list = this.data.shoppingList;
        if (list.length === 0) {
            wx.showToast({ title: '暂无清单', icon: 'none' });
            return;
        }
        let text = `🛒 未来${this.data.shopDays}天采购清单\n`;
        for (const g of this.data.shoppingGroups) {
            text += `\n【${g.area}】\n`;
            text += g.items.map(i => `• ${i.name} ${i.toBuy}份`).join('\n');
        }
        wx.setClipboardData({
            data: text,
            success: () => {
                wx.showToast({ title: '已复制', icon: 'success' });
            }
        });
    }
});
