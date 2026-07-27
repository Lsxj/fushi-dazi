"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const categories_1 = require("../../data/categories");
const ingredients_1 = require("../../data/ingredients");
const storage_1 = require("../../utils/storage");
const customFoods_1 = require("../../utils/customFoods");
const LOC_LABEL = { frozen: '冷冻', refrigerated: '冷藏', room: '常温' };
Page({
    data: {
        groups: [],
        totalChecked: 0,
        selections: {}
    },
    onLoad() {
        const customs = (0, customFoods_1.getCustomFoods)();
        const ingMap = new Map(ingredients_1.INGREDIENTS.map(i => [i.name, i]));
        const customMap = new Map(customs.map(f => [f.name, f]));
        const groups = categories_1.CATEGORIES.map(cat => {
            const memberItems = cat.members.map(name => {
                const ing = ingMap.get(name);
                if (ing) {
                    return {
                        name: ing.name,
                        categoryId: ing.categoryId,
                        storageLabel: LOC_LABEL[ing.defaultStorage],
                        servingGramsPerPortion: ing.servingGramsPerPortion,
                        checked: false,
                        portions: 1
                    };
                }
                return {
                    name,
                    categoryId: cat.id,
                    storageLabel: '冷藏',
                    servingGramsPerPortion: 30,
                    checked: false,
                    portions: 1
                };
            });
            const customItems = customs
                .filter(f => f.categoryId === cat.id)
                .filter(f => !cat.members.includes(f.name))
                .map(f => ({
                name: f.name,
                categoryId: f.categoryId,
                storageLabel: LOC_LABEL[f.defaultStorage] + ' · 自定义',
                servingGramsPerPortion: f.servingGramsPerPortion,
                checked: false,
                portions: 1
            }));
            const items = [...memberItems, ...customItems];
            return {
                id: cat.id,
                name: cat.name,
                items,
                expanded: ['grainLow', 'root', 'leafy'].includes(cat.id),
                checkedCount: 0
            };
        }).filter(g => g.items.length > 0);
        this.setData({ groups });
    },
    toggleGroup(e) {
        const id = e.currentTarget.dataset.id;
        const groups = this.data.groups.map(g => g.id === id ? { ...g, expanded: !g.expanded } : g);
        this.setData({ groups });
    },
    toggleIngredient(e) {
        const name = e.currentTarget.dataset.name;
        this.updateItem(name, item => ({ ...item, checked: !item.checked }));
    },
    incPortions(e) {
        const name = e.currentTarget.dataset.name;
        this.updateItem(name, item => ({ ...item, portions: item.portions + 1 }));
    },
    decPortions(e) {
        const name = e.currentTarget.dataset.name;
        this.updateItem(name, item => ({ ...item, portions: Math.max(1, item.portions - 1) }));
    },
    noop() { },
    updateItem(name, fn) {
        let totalChecked = 0;
        const groups = this.data.groups.map(g => {
            let checkedCount = 0;
            const items = g.items.map(it => {
                const next = it.name === name ? fn(it) : it;
                if (next.checked)
                    checkedCount++;
                return next;
            });
            totalChecked += checkedCount;
            return { ...g, items, checkedCount };
        });
        this.setData({ groups, totalChecked });
    },
    skipAll() {
        const fromWelcome = !!this.data.fromWelcome;
        wx.setStorageSync('onboardingDone', true);
        wx.setStorageSync('fridgeOnboardDismissed', true);
        wx.setStorageSync('setupDone', true);
        wx.reLaunch({ url: '/pages/index/index' });
    },
    finish() {
        let count = 0;
        for (const g of this.data.groups) {
            for (const it of g.items) {
                if (it.checked) {
                    (0, storage_1.quickAddFridgeItem)(it.name, it.portions);
                    count++;
                }
            }
        }
        wx.setStorageSync('onboardingDone', true);
        wx.setStorageSync('fridgeOnboardDismissed', true);
        wx.setStorageSync('setupDone', true);
        if (count > 0) {
            wx.showToast({ title: `已添加 ${count} 种食材`, icon: 'success' });
        }
        setTimeout(() => {
            wx.reLaunch({ url: '/pages/index/index' });
        }, 800);
    }
});
