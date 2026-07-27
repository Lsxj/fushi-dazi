"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const categories_1 = require("../../data/categories");
const planner_1 = require("../../utils/planner");
function recommendMealsForAge(months) {
    if (months < 6)
        return 1;
    if (months < 7)
        return 1;
    if (months < 10)
        return 2;
    return 3;
}
function getMealBasis(months) {
    if (months < 6)
        return '4-6月,以奶为主试少量';
    if (months < 7)
        return '6-7月,1-2顿';
    if (months < 10)
        return '7-9月,2顿';
    return '10月+,3顿';
}
Page({
    data: {
        step: 0,
        babyName: '',
        today: '',
        birthday: '',
        ageMonths: 0,
        mealsPerDay: 2,
        recommendedMeals: 2,
        recommendBasis: '',
        groups: [],
        totalChecked: 0,
        openedCats: 0
    },
    onLoad() {
        const setupDone = wx.getStorageSync('setupDone');
        const profile = wx.getStorageSync('babyProfile');
        if (setupDone && profile) {
            wx.reLaunch({ url: '/pages/index/index' });
            return;
        }
        const todayStr = new Date().toISOString().slice(0, 10);
        this.setData({ today: todayStr });
        this.buildGroups();
    },
    buildGroups() {
        const groups = categories_1.CATEGORIES
            .filter(cat => !cat.noAllergyTracking)
            .map(cat => {
            const items = (0, categories_1.getPrimaryMembers)(cat.id).map(name => ({ name, checked: false }));
            return {
                id: cat.id,
                name: cat.name,
                recommendedMonth: cat.recommendedMonth,
                items,
                expanded: false,
                checkedCount: 0,
                allChecked: false
            };
        }).filter(g => g.items.length > 0);
        this.setData({ groups });
    },
    next() {
        this.setData({ step: this.data.step + 1 });
    },
    prev() {
        this.setData({ step: Math.max(0, this.data.step - 1) });
    },
    onName(e) {
        this.setData({ babyName: e.detail.value });
    },
    onBirthday(e) {
        const value = e.detail.value;
        const months = (0, planner_1.calcAgeMonths)(value);
        const recommended = recommendMealsForAge(months);
        this.setData({
            birthday: value,
            ageMonths: months,
            recommendedMeals: recommended,
            recommendBasis: getMealBasis(months),
            mealsPerDay: recommended
        });
    },
    onMeals(e) {
        this.setData({ mealsPerDay: parseInt(e.detail.value, 10) + 1 });
    },
    confirmStep1() {
        if (!this.data.birthday) {
            wx.showToast({ title: '请选择宝宝生日', icon: 'none' });
            return;
        }
        this.setData({ step: 2 });
    },
    toggleGroup(e) {
        const id = e.currentTarget.dataset.id;
        const groups = this.data.groups.map(g => g.id === id ? { ...g, expanded: !g.expanded } : g);
        this.setData({ groups });
    },
    toggleIng(e) {
        const name = e.currentTarget.dataset.name;
        this.recalcGroups(this.data.groups.map(g => ({
            ...g,
            items: g.items.map(it => it.name === name ? { ...it, checked: !it.checked } : it)
        })));
    },
    toggleAllInGroup(e) {
        const id = e.currentTarget.dataset.id;
        const groups = this.data.groups.map(g => {
            if (g.id !== id)
                return g;
            const wasAll = g.items.every(i => i.checked);
            return {
                ...g,
                items: g.items.map(i => ({ ...i, checked: !wasAll }))
            };
        });
        this.recalcGroups(groups);
    },
    recalcGroups(groups) {
        let totalChecked = 0;
        const openedSet = new Set();
        const next = groups.map(g => {
            const checkedCount = g.items.filter(i => i.checked).length;
            if (checkedCount > 0)
                openedSet.add(g.id);
            totalChecked += checkedCount;
            return {
                ...g,
                checkedCount,
                allChecked: checkedCount === g.items.length && checkedCount > 0
            };
        });
        this.setData({ groups: next, totalChecked, openedCats: openedSet.size });
    },
    confirmStep2() {
        this.setData({ step: 3 });
    },
    buildProfile() {
        const profile = {
            babyName: this.data.babyName.trim() || '宝宝',
            birthday: this.data.birthday,
            ageMonths: this.data.ageMonths,
            mealsPerDay: this.data.mealsPerDay,
            currentStatus: 'normal',
            categoryAllergies: {},
            individualExceptions: {},
            confirmedFoods: []
        };
        const today = new Date();
        const stableDate = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
        for (const cat of categories_1.CATEGORIES) {
            if (cat.noAllergyTracking) {
                profile.categoryAllergies[cat.id] = {
                    state: 'open',
                    passedDate: stableDate
                };
            }
            else {
                profile.categoryAllergies[cat.id] = { state: 'untried' };
            }
        }
        for (const g of this.data.groups) {
            const checkedNames = g.items.filter(i => i.checked).map(i => i.name);
            if (checkedNames.length > 0) {
                profile.categoryAllergies[g.id] = {
                    state: 'open',
                    representative: checkedNames[0],
                    passedDate: stableDate
                };
                profile.confirmedFoods.push(...checkedNames);
            }
        }
        for (const cat of categories_1.CATEGORIES) {
            if (cat.noAllergyTracking)
                continue;
            if (cat.recommendedMonth > this.data.ageMonths + 6) {
                if (profile.categoryAllergies[cat.id].state === 'untried') {
                    profile.categoryAllergies[cat.id].state = 'locked';
                }
            }
        }
        return profile;
    },
    finishSkipFridge() {
        const profile = this.buildProfile();
        wx.setStorageSync('babyProfile', profile);
        wx.setStorageSync('setupDone', true);
        wx.removeStorageSync('weeklyPlan');
        wx.showToast({ title: '设置完成', icon: 'success' });
        setTimeout(() => {
            wx.reLaunch({ url: '/pages/index/index' });
        }, 800);
    },
    goFridgeOnboarding() {
        const profile = this.buildProfile();
        wx.setStorageSync('babyProfile', profile);
        wx.setStorageSync('setupDone', true);
        wx.removeStorageSync('weeklyPlan');
        wx.navigateTo({ url: '/pages/onboarding/onboarding?from=welcome' });
    }
});
