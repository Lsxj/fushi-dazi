"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const categories_1 = require("../../data/categories");
const storage_1 = require("../../utils/storage");
const planner_1 = require("../../utils/planner");
const customFoods_1 = require("../../utils/customFoods");
const storageGuide_1 = require("../../utils/storageGuide");
const CAT_NAME = {};
categories_1.CATEGORIES.forEach(c => { CAT_NAME[c.id] = c.name; });
function buildAllIngredients() {
    const seen = new Set();
    const result = [];
    for (const cat of categories_1.CATEGORIES) {
        for (const name of cat.members) {
            if (seen.has(name))
                continue;
            seen.add(name);
            const guide = (0, storageGuide_1.getStorageGuide)(name);
            result.push({ name, categoryName: cat.name, storageLine: guide.shortLine });
        }
    }
    for (const f of (0, customFoods_1.getCustomFoods)()) {
        if (seen.has(f.name))
            continue;
        seen.add(f.name);
        const guide = (0, storageGuide_1.getStorageGuide)(f.name);
        result.push({ name: f.name, categoryName: (CAT_NAME[f.categoryId] || '') + ' · 自定义', storageLine: guide.shortLine });
    }
    return result;
}
Page({
    data: {
        keyword: '',
        filtered: [],
        recent: [],
        planNeed: []
    },
    onShow() {
        const all = buildAllIngredients();
        const plan = wx.getStorageSync('weeklyPlan') || [];
        const planNeed = (0, planner_1.aggregateShoppingList)(plan).map(s => s.name);
        this.setData({
            filtered: all,
            recent: (0, storage_1.getRecentlyAdded)(8),
            planNeed
        });
    },
    onSearch(e) {
        const kw = (e.detail.value || '').trim().toLowerCase();
        const all = buildAllIngredients();
        if (!kw) {
            this.setData({ keyword: '', filtered: all });
            return;
        }
        const filtered = all.filter(i => i.name.toLowerCase().includes(kw));
        this.setData({ keyword: kw, filtered });
    },
    quickAdd(e) {
        const name = e.currentTarget.dataset.name;
        (0, storage_1.quickAddFridgeItem)(name, 1);
        wx.showToast({ title: `已加 1份 ${name}`, icon: 'success', duration: 800 });
        this.setData({ recent: (0, storage_1.getRecentlyAdded)(8) });
    }
});
