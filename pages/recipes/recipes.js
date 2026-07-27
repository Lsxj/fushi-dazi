"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const recipes_1 = require("../../data/recipes");
const planner_1 = require("../../utils/planner");
const CAT_LABEL = {
    staple: '主食', protein: '蛋白', veg: '蔬菜', fruit: '水果'
};
Page({
    data: {
        keyword: '',
        filterTab: 'safe',
        total: recipes_1.RECIPES.length,
        filtered: []
    },
    onLoad(query) {
        if (query && query.with) {
            const kw = decodeURIComponent(query.with);
            this.setData({ keyword: kw, filterTab: 'all' });
        }
    },
    onShow() {
        this.refresh();
    },
    refresh() {
        const profile = wx.getStorageSync('babyProfile');
        let filtered = recipes_1.RECIPES;
        if (this.data.filterTab === 'safe' && profile) {
            filtered = filtered.filter(r => (0, planner_1.isRecipeApplicable)(r, profile).applicable);
        }
        else if (['staple', 'protein', 'veg', 'fruit'].includes(this.data.filterTab)) {
            filtered = filtered.filter(r => r.mealCategories.includes(this.data.filterTab));
        }
        if (this.data.keyword) {
            const kw = this.data.keyword.toLowerCase();
            filtered = filtered.filter(r => r.name.toLowerCase().includes(kw) ||
                r.ingredients.some(i => i.name.toLowerCase().includes(kw)));
        }
        const enriched = filtered.map(r => {
            const applicableCheck = profile ? (0, planner_1.isRecipeApplicable)(r, profile) : { applicable: true };
            return {
                ...r,
                catLabels: r.mealCategories.map(c => CAT_LABEL[c] || c),
                ingredientsText: r.ingredients.map(i => `${i.name}${i.portions > 1 ? ' x' + i.portions : ''}`).join(' + '),
                safe: applicableCheck.applicable,
                unsafeReason: applicableCheck.applicable ? undefined : applicableCheck.reason
            };
        });
        this.setData({ filtered: enriched });
    },
    onSearch(e) {
        this.setData({ keyword: e.detail.value });
        this.refresh();
    },
    setTab(e) {
        this.setData({ filterTab: e.currentTarget.dataset.tab });
        this.refresh();
    },
    openDetail(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: `/pages/recipe/recipe?id=${id}` });
    }
});
