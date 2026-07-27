"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const storage_1 = require("../../utils/storage");
const storageGuide_1 = require("../../utils/storageGuide");
const recipes_1 = require("../../data/recipes");
const planner_1 = require("../../utils/planner");
const dateUtil_1 = require("../../utils/dateUtil");
const LOC_TO_LABEL = { frozen: '冷冻', refrigerated: '冷藏', room: '常温' };
const LOC_OPTIONS = ['frozen', 'refrigerated', 'room'];
Page({
    data: {
        items: [],
        priorityItems: [],
        filteredItems: [],
        totalKinds: 0,
        urgentCount: 0,
        lowStockCount: 0,
        todayAdviceCount: 0,
        searchKey: '',
        locationTab: 'all',
        filterChip: 'none',
        sortBy: 'expiry',
        sortLabel: '排序',
        showOnboardHint: false,
        batchMode: false,
        selectedKeys: [],
        moreOpenKey: '',
        moreOpenName: ''
    },
    onShow() {
        this.refresh();
    },
    refresh() {
        const fridge = (0, storage_1.getFridge)();
        const now = (0, dateUtil_1.todayLocalStartMs)();
        const items = fridge.map((f, i) => {
            const guide = (0, storageGuide_1.getStorageGuide)(f.name);
            const diffDays = Math.floor(((0, dateUtil_1.parseLocalDateMs)(f.expiryDate) - now) / 86400000);
            const isExpired = diffDays < 0;
            const isUrgent = !isExpired && diffDays <= 2;
            const isLowStock = f.portions <= 1;
            const expiryHint = isExpired
                ? '已过期'
                : diffDays === 0
                    ? '今天过期'
                    : `剩 ${diffDays} 天过期`;
            let statusBadge;
            let statusBadgeColor;
            if (isExpired || isUrgent) {
                statusBadge = '建议优先吃';
                statusBadgeColor = 'urgent';
            }
            else if (isLowStock) {
                statusBadge = '库存仅 1 份';
                statusBadgeColor = 'low';
            }
            return {
                ...f,
                key: `${f.name}-${i}`,
                daysToExpiry: diffDays,
                locationLabel: LOC_TO_LABEL[f.storageLocation] || '常温',
                isUrgent,
                isExpired,
                isLowStock,
                tip: guide.tip,
                shortLine: guide.shortLine,
                tipExpanded: false,
                expiryHint,
                statusBadge,
                statusBadgeColor
            };
        });
        const priorityItems = items.filter(i => i.isUrgent || i.isExpired);
        const onboardingDismissed = wx.getStorageSync('fridgeOnboardDismissed');
        const showOnboardHint = items.length === 0 && !onboardingDismissed;
        this.setData({
            items,
            priorityItems,
            totalKinds: items.length,
            urgentCount: (0, storage_1.getUrgentItems)().length + (0, storage_1.getExpired)().length,
            lowStockCount: (0, storage_1.getLowStockItems)().length,
            todayAdviceCount: (0, storage_1.getTodayAdviceCount)(),
            showOnboardHint
        }, () => this.applyFilter());
    },
    applyFilter() {
        let list = [...this.data.items];
        const kw = this.data.searchKey.trim().toLowerCase();
        if (kw)
            list = list.filter(i => i.name.toLowerCase().includes(kw));
        if (this.data.locationTab !== 'all') {
            list = list.filter(i => i.storageLocation === this.data.locationTab);
        }
        switch (this.data.filterChip) {
            case 'urgent':
                list = list.filter(i => i.isUrgent || i.isExpired);
                break;
            case 'low':
                list = list.filter(i => i.isLowStock);
                break;
            case 'recent': {
                const fridge = (0, storage_1.getFridge)();
                const recentKeys = new Set(fridge.slice(-8).map((f, i) => `${f.name}-${fridge.length - 8 + i}`));
                list = list.filter(i => recentKeys.has(i.key));
                break;
            }
        }
        switch (this.data.sortBy) {
            case 'expiry':
                list.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
                break;
            case 'added':
                list.sort((a, b) => Number(b.key.split('-').pop()) - Number(a.key.split('-').pop()));
                break;
            case 'portions':
                list.sort((a, b) => b.portions - a.portions);
                break;
        }
        this.setData({ filteredItems: list });
    },
    filterByUrgent() {
        this.setData({ filterChip: 'urgent', locationTab: 'all' }, () => this.applyFilter());
    },
    filterByLow() {
        this.setData({ filterChip: 'low', locationTab: 'all' }, () => this.applyFilter());
    },
    showTodayAdvice() {
        wx.showModal({
            title: '今日建议',
            content: `临期 ${this.data.urgentCount} 项、库存少 ${this.data.lowStockCount} 项。建议优先安排到明日辅食计划。`,
            confirmText: '去计划',
            success: r => { if (r.confirm)
                wx.switchTab({ url: '/pages/plan/plan' }); }
        });
    },
    onSearch(e) {
        this.setData({ searchKey: e.detail.value || '' }, () => this.applyFilter());
    },
    setLocationTab(e) {
        this.setData({ locationTab: e.currentTarget.dataset.tab }, () => this.applyFilter());
    },
    setChip(e) {
        const v = e.currentTarget.dataset.chip;
        this.setData({ filterChip: this.data.filterChip === v ? 'none' : v }, () => this.applyFilter());
    },
    showSort() {
        const labels = ['按过期日(近→远)', '按添加日(新→旧)', '按份数(多→少)'];
        const keys = ['expiry', 'added', 'portions'];
        wx.showActionSheet({
            itemList: labels,
            success: r => {
                const sortBy = keys[r.tapIndex];
                this.setData({ sortBy, sortLabel: labels[r.tapIndex] }, () => this.applyFilter());
            }
        });
    },
    stepInc(e) {
        const { key, name, loc } = e.currentTarget.dataset;
        (0, storage_1.quickAddFridgeItem)(name, 1, loc);
        this.refresh();
    },
    stepDec(e) {
        const { key, name } = e.currentTarget.dataset;
        const it = this.data.items.find(i => i.key === key);
        if (!it)
            return;
        if (it.portions <= 1) {
            wx.showModal({
                title: '移除该食材?',
                content: `「${name}」最后 1 份，再扣减将移除。`,
                confirmText: '移除',
                confirmColor: '#E57373',
                success: r => {
                    if (r.confirm) {
                        (0, storage_1.consumePortion)(name, 1);
                        this.refresh();
                    }
                }
            });
        }
        else {
            (0, storage_1.consumePortion)(name, 1);
            this.refresh();
        }
    },
    dismissOnboard() {
        wx.setStorageSync('fridgeOnboardDismissed', true);
        this.setData({ showOnboardHint: false });
    },
    openMore(e) {
        const key = e.currentTarget.dataset.key;
        const item = this.data.items.find(i => i.key === key);
        this.setData({ moreOpenKey: key, moreOpenName: item ? item.name : '' });
    },
    closeMore() {
        this.setData({ moreOpenKey: '', moreOpenName: '' });
    },
    stopPropagation() { },
    actionAdjustExpiry(e) {
        const key = e.currentTarget.dataset.key;
        const item = this.data.items.find(i => i.key === key);
        if (!item)
            return;
        this.setData({ moreOpenKey: '' });
        wx.showActionSheet({
            itemList: ['延长 3 天', '延长 7 天', '延长 14 天', '重置为今天起 7 天'],
            success: r => {
                const days = [3, 7, 14][r.tapIndex];
                const baseMs = r.tapIndex === 3 ? (0, dateUtil_1.todayLocalStartMs)() : (0, dateUtil_1.parseLocalDateMs)(item.expiryDate);
                const newExpiry = new Date(baseMs + (days || 7) * 86400000);
                (0, storage_1.updateItemByKey)(key, { expiryDate: (0, dateUtil_1.formatLocalDate)(newExpiry) });
                wx.showToast({ title: '已更新保质期', icon: 'success' });
                this.refresh();
            }
        });
    },
    actionMoveLocation(e) {
        const key = e.currentTarget.dataset.key;
        this.setData({ moreOpenKey: '' });
        wx.showActionSheet({
            itemList: ['移到冷冻', '移到冷藏', '移到常温'],
            success: r => {
                const loc = LOC_OPTIONS[r.tapIndex];
                (0, storage_1.moveItemLocation)(key, loc);
                wx.showToast({ title: `已移到${LOC_TO_LABEL[loc]}`, icon: 'success' });
                this.refresh();
            }
        });
    },
    actionAddToShopList(e) {
        const { key, name } = e.currentTarget.dataset;
        this.setData({ moreOpenKey: '' });
        wx.showActionSheet({
            itemList: ['1 份', '2 份', '3 份', '5 份'],
            success: r => {
                const portions = [1, 2, 3, 5][r.tapIndex];
                (0, storage_1.addToManualShopList)(name, portions);
                wx.showToast({ title: `${name} +${portions} 份采购`, icon: 'success' });
            }
        });
    },
    actionAddToTomorrow(e) {
        const { name } = e.currentTarget.dataset;
        this.setData({ moreOpenKey: '' });
        const matching = recipes_1.RECIPES.filter(r => r.ingredients.some(i => i.name === name));
        if (matching.length === 0) {
            wx.showToast({ title: `没有含${name}的食谱`, icon: 'none' });
            return;
        }
        const plan = wx.getStorageSync('weeklyPlan') || [];
        const tomorrow = (0, dateUtil_1.formatLocalDate)(new Date((0, dateUtil_1.todayLocalStartMs)() + 86400000));
        const day = plan.find(p => p.date === tomorrow);
        if (!day || day.meals.length === 0) {
            wx.showToast({ title: '请先生成明日计划', icon: 'none' });
            return;
        }
        const labels = day.meals.map(m => `第${m.mealIndex + 1}餐 (当前: ${m.recipe.name})`);
        wx.showActionSheet({
            itemList: labels,
            success: r => {
                const target = day.meals[r.tapIndex];
                const profile = wx.getStorageSync('babyProfile');
                let chosen = matching[0];
                if (profile) {
                    const safe = matching.find(rec => (0, planner_1.isRecipeApplicable)(rec, profile).applicable);
                    if (safe)
                        chosen = safe;
                }
                target.recipe = chosen;
                wx.setStorageSync('weeklyPlan', plan);
                wx.showModal({
                    title: '明日已更新',
                    content: `第${target.mealIndex + 1}餐 → ${chosen.name}（用上${name}）`,
                    confirmText: '去看计划',
                    success: rr => { if (rr.confirm)
                        wx.switchTab({ url: '/pages/plan/plan' }); }
                });
            }
        });
    },
    actionViewRecipes(e) {
        const { name } = e.currentTarget.dataset;
        this.setData({ moreOpenKey: '' });
        wx.navigateTo({ url: `/pages/recipes/recipes?with=${encodeURIComponent(name)}` });
    },
    actionDiscard(e) {
        const { key, name } = e.currentTarget.dataset;
        this.setData({ moreOpenKey: '' });
        wx.showModal({
            title: '丢弃并移除?',
            content: `「${name}」将从冰箱移除。`,
            confirmText: '丢弃',
            confirmColor: '#E57373',
            success: r => {
                if (r.confirm) {
                    (0, storage_1.removeItemByKey)(key);
                    wx.showToast({ title: '已移除', icon: 'success' });
                    this.refresh();
                }
            }
        });
    },
    toggleTip(e) {
        const key = e.currentTarget.dataset.key;
        const items = this.data.items.map(it => it.key === key ? { ...it, tipExpanded: !it.tipExpanded } : it);
        this.setData({ items }, () => this.applyFilter());
    },
    toggleBatch() {
        this.setData({
            batchMode: !this.data.batchMode,
            selectedKeys: [],
            moreOpenKey: ''
        });
    },
    toggleSelect(e) {
        const key = e.currentTarget.dataset.key;
        const sel = this.data.selectedKeys;
        const next = sel.includes(key) ? sel.filter(k => k !== key) : [...sel, key];
        this.setData({ selectedKeys: next });
    },
    selectAll() {
        this.setData({ selectedKeys: this.data.filteredItems.map(i => i.key) });
    },
    clearSelection() {
        this.setData({ selectedKeys: [] });
    },
    batchDiscard() {
        if (this.data.selectedKeys.length === 0)
            return;
        wx.showModal({
            title: `丢弃 ${this.data.selectedKeys.length} 项?`,
            content: '所选食材将从冰箱移除',
            confirmText: '丢弃',
            confirmColor: '#E57373',
            success: r => {
                if (!r.confirm)
                    return;
                const keys = [...this.data.selectedKeys].sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
                keys.forEach(k => (0, storage_1.removeItemByKey)(k));
                wx.showToast({ title: `已移除 ${keys.length} 项`, icon: 'success' });
                this.setData({ selectedKeys: [], batchMode: false });
                this.refresh();
            }
        });
    },
    batchToShopList() {
        if (this.data.selectedKeys.length === 0)
            return;
        const sel = this.data.selectedKeys;
        const names = this.data.items.filter(i => sel.includes(i.key)).map(i => i.name);
        names.forEach(n => (0, storage_1.addToManualShopList)(n, 1));
        wx.showToast({ title: `${names.length} 项已加入采购`, icon: 'success' });
        this.setData({ selectedKeys: [], batchMode: false });
    }
});
