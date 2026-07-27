"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const categories_1 = require("../../data/categories");
const planner_1 = require("../../utils/planner");
const customFoods_1 = require("../../utils/customFoods");
function syncPlan(profile) {
    const existingPlan = wx.getStorageSync('weeklyPlan') || [];
    if (existingPlan.length > 0) {
        const newPlan = (0, planner_1.regenerateKeepingLoggedToday)(profile, existingPlan);
        wx.setStorageSync('weeklyPlan', newPlan);
    }
}
const STATE_LABEL = {
    open: '已开放',
    trying: '排敏中',
    observation: '观察期',
    untried: '未引入',
    locked: '暂锁定'
};
const EXCEPTION_LABEL = {
    following: '跟随品类',
    allergic: '过敏',
    observation: '观察期',
    introducing: '引入观察'
};
Page({
    data: {
        categoryList: [],
        expandedIds: [],
        addingCatId: '',
        customInputValue: ''
    },
    onShow() {
        this.refresh();
    },
    refresh() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const expandedIds = this.data.expandedIds;
        const customSet = new Set((0, customFoods_1.getCustomFoods)().map(f => f.name));
        const confirmedSet = new Set(profile.confirmedFoods || []);
        const currentTryingCatId = (0, planner_1.getCurrentTryingCategoryId)(profile);
        const currentTryingFood = currentTryingCatId
            ? profile.categoryAllergies[currentTryingCatId]?.tryingFood
            : null;
        const catList = categories_1.CATEGORIES.filter(cat => !cat.noAllergyTracking).map(cat => {
            const a = profile.categoryAllergies[cat.id] || { state: 'untried' };
            const allMembers = (0, categories_1.getPrimaryMembers)(cat.id);
            const memberStates = allMembers.map(name => {
                const ex = profile.individualExceptions[name];
                const exState = ex?.state || 'following';
                const isCurrentlyTrying = currentTryingFood === name;
                const canStartTrying = !confirmedSet.has(name)
                    && exState === 'following'
                    && !isCurrentlyTrying
                    && !currentTryingFood
                    && a.state !== 'locked';
                const tryingDays = a.state === 'open' ? planner_1.TRYING_DAYS_INCATEGORY : planner_1.TRYING_DAYS_REQUIRED;
                return {
                    name,
                    exceptionState: exState,
                    exceptionLabel: EXCEPTION_LABEL[exState],
                    isCustom: customSet.has(name),
                    isConfirmed: confirmedSet.has(name),
                    isCurrentlyTrying,
                    canStartTrying,
                    tryingDays
                };
            });
            const exceptionCount = memberStates.filter(m => m.exceptionState !== 'following').length;
            const confirmedCount = memberStates.filter(m => m.isConfirmed).length;
            return {
                id: cat.id,
                name: cat.name,
                commonAllergen: !!cat.commonAllergen,
                recommendedMonth: cat.recommendedMonth,
                representative: a.representative,
                note: a.note,
                state: a.state,
                stateLabel: STATE_LABEL[a.state] || '未引入',
                members: memberStates,
                expanded: expandedIds.includes(cat.id),
                exceptionCount,
                confirmedCount
            };
        });
        this.setData({ categoryList: catList });
    },
    toggleConfirmed(e) {
        const name = e.currentTarget.dataset.name;
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        if (!profile.confirmedFoods)
            profile.confirmedFoods = [];
        const isConfirmed = profile.confirmedFoods.includes(name);
        if (isConfirmed) {
            wx.showModal({
                title: '取消已确认',
                content: `${name} 将变回"跟随品类",疫苗后会被排除`,
                success: (res) => {
                    if (!res.confirm)
                        return;
                    profile.confirmedFoods = profile.confirmedFoods.filter(f => f !== name);
                    wx.setStorageSync('babyProfile', profile);
                    syncPlan(profile);
                    this.refresh();
                }
            });
            return;
        }
        const ex = profile.individualExceptions[name];
        if (ex?.state === 'introducing') {
            wx.showToast({ title: `${name} 引入观察中,${ex.nextRetryDate} 后自动确认`, icon: 'none', duration: 2200 });
            return;
        }
        const days = planner_1.TRYING_DAYS_REQUIRED;
        const tryingLabel = `开始排敏 (${days} 天观察)`;
        wx.showActionSheet({
            itemList: ['吃过,直接确认安全', tryingLabel],
            success: (res) => {
                if (res.tapIndex === 0) {
                    profile.confirmedFoods.push(name);
                    wx.setStorageSync('babyProfile', profile);
                    syncPlan(profile);
                    wx.showToast({ title: `${name} 已确认`, icon: 'success', duration: 800 });
                    this.refresh();
                }
                else if (res.tapIndex === 1) {
                    this.doStartTrying(name);
                }
            }
        });
    },
    startTryingMember(e) {
        const name = e.currentTarget.dataset.name;
        this.doStartTrying(name);
    },
    doStartTrying(name) {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const currentTrying = (0, planner_1.getCurrentTryingCategoryId)(profile);
        if (currentTrying) {
            const tryingFood = profile.categoryAllergies[currentTrying]?.tryingFood;
            wx.showToast({ title: `先完成 ${tryingFood} 排敏再引入新食物`, icon: 'none', duration: 1800 });
            return;
        }
        const cat = categories_1.CATEGORIES.find(c => c.members.includes(name));
        if (!cat) {
            wx.showToast({ title: '该食材未在分类库', icon: 'none' });
            return;
        }
        const today = (0, planner_1.formatDate)(new Date());
        const journal = wx.getStorageSync('mealJournal') || [];
        const loggedIdx = new Set(journal.filter(l => l.date === today).map(l => l.mealIndex));
        const plan = wx.getStorageSync('weeklyPlan') || [];
        const todayPlan = plan.find(p => p.date === today);
        const hasUnloggedToday = !!todayPlan && todayPlan.meals.some(m => !loggedIdx.has(m.mealIndex));
        const result = (0, planner_1.startTryingForFood)(profile, cat.id, name, hasUnloggedToday);
        if (!result)
            return;
        wx.setStorageSync('babyProfile', result.profile);
        syncPlan(result.profile);
        this.refresh();
        const newPlan = wx.getStorageSync('weeklyPlan') || [];
        const targetDate = hasUnloggedToday ? today : (0, planner_1.formatDate)(new Date(Date.now() + 86400000));
        const targetPlan = newPlan.find(p => p.date === targetDate);
        const targetCount = targetPlan ? targetPlan.meals.filter(m => m.recipe.ingredients.some(i => i.name === name)).length : 0;
        const recipesWithTrying = (0, planner_1.getApplicableRecipes)(result.profile).filter(r => r.ingredients.some(i => i.name === name)).length;
        const dayWord = hasUnloggedToday ? '今日' : '明日';
        if (targetCount > 0) {
            wx.showModal({
                title: `${name} 排敏${hasUnloggedToday ? '已启动' : '，明日开始'}`,
                content: `${dayWord}有 ${targetCount} 餐含 ${name}，喂完后观察 ${result.daysRequired} 天没反应就加入安全清单。`,
                showCancel: false,
                confirmText: hasUnloggedToday ? '看看菜单' : '知道了',
                success: (res) => {
                    if (res.confirm && hasUnloggedToday) {
                        wx.switchTab({ url: '/pages/index/index' });
                    }
                }
            });
        }
        else if (recipesWithTrying === 0) {
            wx.showModal({
                title: `${name} 排敏已启动，但...`,
                content: `当前安全清单凑不出含 ${name} 的食谱。去食谱库手动加一道，或先开放更多基础品类。`,
                confirmText: '去食谱库',
                cancelText: '稍后',
                success: (res) => {
                    if (res.confirm)
                        wx.navigateTo({ url: '/pages/recipes/recipes' });
                }
            });
        }
        else {
            wx.showToast({
                title: `${name} 排敏 ${hasUnloggedToday ? '今天' : '明天'}开始 (${result.daysRequired}天观察)`,
                icon: 'success',
                duration: 1800
            });
        }
    },
    toggleCategory(e) {
        const id = e.currentTarget.dataset.id;
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        if (!profile.categoryAllergies[id])
            profile.categoryAllergies[id] = { state: 'untried' };
        const cur = profile.categoryAllergies[id].state;
        if (cur === 'trying') {
            wx.showToast({ title: '排敏中，去首页停止排敏后再切换', icon: 'none', duration: 1800 });
            return;
        }
        const cycle = {
            untried: 'open',
            open: 'observation',
            observation: 'locked',
            locked: 'untried'
        };
        const next = cycle[cur] || 'untried';
        if (next === 'open') {
            const cat = categories_1.CATEGORIES.find(c => c.id === id);
            const catName = cat?.name || '该品类';
            const members = (0, categories_1.getPrimaryMembers)(id);
            const alreadyConfirmed = new Set(profile.confirmedFoods || []);
            const toAdd = members.filter(m => !alreadyConfirmed.has(m));
            const that = this;
            wx.showActionSheet({
                itemList: [
                    `✅ ${catName} 下 ${toAdd.length || members.length} 种食材都稳定吃过 (批量加入)`,
                    '🌱 我来逐个选 (只切状态,自动展开)'
                ],
                success: (res) => {
                    profile.categoryAllergies[id].state = 'open';
                    if (!profile.categoryAllergies[id].passedDate) {
                        profile.categoryAllergies[id].passedDate = new Date().toISOString().slice(0, 10);
                    }
                    if (res.tapIndex === 0) {
                        if (!profile.confirmedFoods)
                            profile.confirmedFoods = [];
                        for (const m of members) {
                            if (!profile.confirmedFoods.includes(m))
                                profile.confirmedFoods.push(m);
                        }
                        if (!profile.categoryAllergies[id].representative && members.length > 0) {
                            profile.categoryAllergies[id].representative = members[0];
                        }
                        wx.setStorageSync('babyProfile', profile);
                        syncPlan(profile);
                        that.refresh();
                        wx.showToast({ title: `已加入 ${toAdd.length} 种食材`, icon: 'success', duration: 1200 });
                    }
                    else if (res.tapIndex === 1) {
                        wx.setStorageSync('babyProfile', profile);
                        syncPlan(profile);
                        const expanded = that.data.expandedIds.includes(id)
                            ? that.data.expandedIds
                            : [...that.data.expandedIds, id];
                        that.setData({ expandedIds: expanded });
                        that.refresh();
                        wx.showToast({ title: '展开后逐个点食材右侧确认', icon: 'none', duration: 2200 });
                    }
                },
                fail: () => {
                }
            });
            return;
        }
        profile.categoryAllergies[id].state = next;
        if (next === 'untried' && profile.confirmedFoods) {
            const cat = categories_1.CATEGORIES.find(c => c.id === id);
            if (cat) {
                const members = new Set((0, categories_1.getAllMembers)(id));
                profile.confirmedFoods = profile.confirmedFoods.filter(f => !members.has(f));
                delete profile.categoryAllergies[id].representative;
            }
        }
        wx.setStorageSync('babyProfile', profile);
        syncPlan(profile);
        this.refresh();
    },
    toggleExpand(e) {
        const id = e.currentTarget.dataset.id;
        const expanded = this.data.expandedIds.includes(id);
        const next = expanded
            ? this.data.expandedIds.filter(x => x !== id)
            : [...this.data.expandedIds, id];
        this.setData({ expandedIds: next });
        this.refresh();
    },
    toggleException(e) {
        const name = e.currentTarget.dataset.name;
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        const cur = profile.individualExceptions[name]?.state || 'following';
        const cycle = {
            following: 'observation',
            observation: 'allergic',
            allergic: 'following'
        };
        const next = cycle[cur];
        if (next === 'following') {
            delete profile.individualExceptions[name];
        }
        else {
            profile.individualExceptions[name] = { state: next };
        }
        wx.setStorageSync('babyProfile', profile);
        syncPlan(profile);
        this.refresh();
    },
    startAddCustom(e) {
        const catId = e.currentTarget.dataset.catId;
        this.setData({ addingCatId: catId, customInputValue: '' });
    },
    onCustomInput(e) {
        this.setData({ customInputValue: e.detail.value });
    },
    cancelCustomFood() {
        this.setData({ addingCatId: '', customInputValue: '' });
    },
    confirmDeleteCustom(e) {
        const name = e.currentTarget.dataset.name;
        wx.showModal({
            title: '删除自定义食材',
            content: `确认删除"${name}"?`,
            success: (res) => {
                if (!res.confirm)
                    return;
                (0, customFoods_1.removeCustomFood)(name);
                const profile = wx.getStorageSync('babyProfile');
                if (profile && profile.individualExceptions[name]) {
                    delete profile.individualExceptions[name];
                    wx.setStorageSync('babyProfile', profile);
                }
                wx.showToast({ title: '已删除', icon: 'success', duration: 700 });
                this.refresh();
            }
        });
    },
    confirmReset() {
        wx.showModal({
            title: '重置宝宝档案?',
            content: '会清空档案、计划、冰箱、日记和反应记录,无法恢复。',
            confirmText: '重置',
            confirmColor: '#E57373',
            success: (res) => {
                if (!res.confirm)
                    return;
                wx.removeStorageSync('babyProfile');
                wx.removeStorageSync('weeklyPlan');
                wx.removeStorageSync('fridge');
                wx.removeStorageSync('mealJournal');
                wx.removeStorageSync('reactions');
                wx.removeStorageSync('customFoods');
                wx.removeStorageSync('setupDone');
                wx.removeStorageSync('onboardingDone');
                wx.removeStorageSync('fridgeOnboardDismissed');
                wx.reLaunch({ url: '/pages/welcome/welcome' });
            }
        });
    },
    confirmCustomFood() {
        const name = (this.data.customInputValue || '').trim();
        const catId = this.data.addingCatId;
        if (!name || !catId) {
            this.cancelCustomFood();
            return;
        }
        const ok = (0, customFoods_1.addCustomFood)({
            name,
            categoryId: catId,
            defaultStorage: 'refrigerated',
            shelfLifeDays: { refrigerated: 30 },
            servingGramsPerPortion: 10
        });
        if (ok) {
            wx.showToast({ title: `已添加 ${name}`, icon: 'success', duration: 800 });
            this.setData({ addingCatId: '', customInputValue: '' });
            this.refresh();
        }
        else {
            wx.showToast({ title: '已存在同名食材', icon: 'none' });
        }
    }
});
