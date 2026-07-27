"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const journal_1 = require("../../utils/journal");
const reactions_1 = require("../../utils/reactions");
const planner_1 = require("../../utils/planner");
const reviewStats_1 = require("../../utils/reviewStats");
const categories_1 = require("../../data/categories");
function syncPlan(profile) {
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
Page({
    data: {
        summary: null,
        activeTab: 'all',
        tabs: [
            { key: 'all', label: '全部' },
            { key: 'reaction', label: '有观察' },
            { key: 'newFood', label: '新食材' },
            { key: 'love', label: '爱吃' },
            { key: 'noRecent', label: '最近未吃' }
        ],
        days: [],
        searchOpen: false,
        searchKeyword: '',
        fabMenuOpen: false,
        manualOpen: false,
        manualIsEditing: false,
        manualEditDate: '',
        manualEditMealIndex: -1,
        manualDate: '',
        manualTime: '',
        manualDishName: '',
        manualIngredientsText: '',
        manualIngChips: [],
        manualIngInput: '',
        manualIngSuggestions: [],
        manualPortion: '',
        manualNote: '',
        todayStr: ''
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
    onShow() {
        this.refresh();
        if (this.getTabBar) {
            const tb = this.getTabBar();
            if (tb)
                tb.setData({ selected: 3 });
        }
    },
    setTab(e) {
        this.setData({ activeTab: e.currentTarget.dataset.key });
        this.refresh();
    },
    refresh() {
        let profile = wx.getStorageSync('babyProfile');
        if (profile && (0, planner_1.reconcileTryingReplaced)(profile)) {
            wx.setStorageSync('babyProfile', profile);
        }
        const allLogs = (0, journal_1.getJournal)();
        const allReactions = (0, reactions_1.getReactions)();
        const firstSeen = (0, reviewStats_1.getFirstSeenMap)();
        profile = wx.getStorageSync('babyProfile');
        const summary = (0, reviewStats_1.summarize7Days)(profile);
        const filterTab = this.data.activeTab;
        let logs = allLogs;
        let reactions = allReactions;
        if (filterTab === 'reaction') {
            logs = [];
        }
        else if (filterTab === 'newFood') {
            reactions = [];
            logs = logs.filter(l => (l.ingredients || []).some(ing => (0, reviewStats_1.isFoodNew)(ing, l, firstSeen, profile)));
        }
        else if (filterTab === 'love') {
            reactions = [];
            logs = logs.filter(l => l.preference === 'love');
        }
        else if (filterTab === 'noRecent') {
            reactions = [];
            const today = new Date();
            const cutoff = new Date(today.getTime() - 7 * 86400000);
            const cutoffStr = cutoff.toISOString().slice(0, 10);
            logs = logs.filter(l => l.date < cutoffStr);
        }
        const kw = (this.data.searchKeyword || '').trim().toLowerCase();
        if (kw) {
            logs = logs.filter(l => {
                const hay = [l.customDishName, l.recipeName, ...(l.ingredients || []), l.note || ''].join('|').toLowerCase();
                return hay.includes(kw);
            });
            reactions = reactions.filter(r => {
                const hay = [r.note || '', ...(r.suspectedFoods || [])].join('|').toLowerCase();
                return hay.includes(kw);
            });
        }
        const timeline = (0, reviewStats_1.buildTimeline)(logs, reactions);
        const groupMap = {};
        for (const ev of timeline) {
            if (!groupMap[ev.date])
                groupMap[ev.date] = [];
            groupMap[ev.date].push(ev);
        }
        const days = Object.keys(groupMap)
            .sort((a, b) => b.localeCompare(a))
            .map(date => ({
            date,
            dateLabel: this.shortDate(date),
            weekday: (0, planner_1.getWeekday)(date),
            events: groupMap[date].map(ev => this.enrichEvent(ev, firstSeen, profile))
        }));
        this.setData({
            summary: {
                ...summary,
                loveDeltaText: (0, reviewStats_1.formatDelta)(summary.loveDelta),
                newFoodDeltaText: (0, reviewStats_1.formatDelta)(summary.newFoodDelta),
                reactionDeltaText: (0, reviewStats_1.formatDelta)(summary.reactionDelta)
            },
            days
        });
    },
    enrichEvent(ev, firstSeen, profile) {
        if (ev.type === 'meal') {
            const log = ev.payload;
            const ingsList = log.ingredients || [];
            let displayName = '';
            let ingredientsLabel = '';
            if (log.customDishName) {
                displayName = log.customDishName;
            }
            else if (log.isCustom) {
                displayName = '自配餐';
            }
            else {
                displayName = log.recipeName;
            }
            const seen = new Set();
            const ingEmojis = [];
            for (const ing of ingsList) {
                if (seen.has(ing))
                    continue;
                seen.add(ing);
                ingEmojis.push({
                    name: ing,
                    emoji: (0, reviewStats_1.getIngredientEmoji)(ing),
                    isNew: (0, reviewStats_1.isFoodNew)(ing, log, firstSeen, profile)
                });
            }
            const hasNewFood = ingEmojis.some(i => i.isNew);
            return {
                type: 'meal',
                date: ev.date,
                timeLabel: ev.timeLabel,
                log,
                mealIndex: log.mealIndex,
                displayName,
                ingredientsLabel,
                ingEmojis,
                hasNewFood,
                portionEmoji: log.portion ? journal_1.PORTION_EMOJI[log.portion] : '',
                portionLabel: log.portion ? journal_1.PORTION_LABEL[log.portion] : '',
                prefEmoji: log.preference ? journal_1.PREFERENCE_EMOJI[log.preference] : '',
                prefLabel: log.preference ? journal_1.PREFERENCE_LABEL[log.preference] : '',
                note: log.note || ''
            };
        }
        else {
            const r = ev.payload;
            return {
                type: 'reaction',
                date: ev.date,
                timeLabel: ev.timeLabel,
                reaction: r,
                typeLabel: `${reactions_1.REACTION_TYPE_EMOJI[r.type]} ${reactions_1.REACTION_TYPE_LABEL[r.type]}`,
                severityLabel: reactions_1.SEVERITY_LABEL[r.severity],
                note: r.note || '',
                suspectedFoods: r.suspectedFoods || [],
                resolved: !!r.resolvedAt
            };
        }
    },
    shortDate(s) {
        const p = s.split('-');
        return `${p[1]}/${p[2]}`;
    },
    onLogTimeChange(e) {
        const date = e.currentTarget.dataset.date;
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        const hhmm = e.detail.value;
        const all = (0, journal_1.getJournal)();
        const log = all.find(l => l.date === date && l.mealIndex === idx);
        if (!log)
            return;
        log.eatenAt = (0, journal_1.combineTime)(date, hhmm);
        (0, journal_1.logMeal)(log);
        wx.showToast({ title: '已更新时间', icon: 'success', duration: 800 });
        this.refresh();
    },
    openLogMenu(e) {
        const date = e.currentTarget.dataset.date;
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        const that = this;
        wx.showActionSheet({
            itemList: ['修改记录', '删除记录'],
            success: (res) => {
                if (res.tapIndex === 0)
                    that.openManualSheetForEdit(date, idx);
                if (res.tapIndex === 1)
                    that.confirmDeleteLog(date, idx);
            }
        });
    },
    confirmDeleteLog(date, idx) {
        const that = this;
        const profile = wx.getStorageSync('babyProfile');
        const tryingFood = profile
            ? Object.values(profile.categoryAllergies).find(c => c.state === 'trying')?.tryingFood || null
            : null;
        const log = (0, journal_1.getJournal)().find(l => l.date === date && l.mealIndex === idx);
        const thisLogHasTrying = !!(tryingFood && log && (log.ingredients || []).includes(tryingFood));
        const otherLogsHaveTrying = tryingFood
            ? (0, journal_1.getJournal)().some(l => l.date === date && l.mealIndex !== idx && (l.ingredients || []).includes(tryingFood))
            : false;
        const willLoseTryingDay = thisLogHasTrying && !otherLogsHaveTrying;
        const baseContent = willLoseTryingDay
            ? `这条记录里有正在排敏的「${tryingFood}」,这天没有其他餐含它。删除后这一天将不计入排敏天,观察期或被延长。`
            : '会从饮食日记里移除这一餐，无法撤销。';
        wx.showModal({
            title: willLoseTryingDay ? '删除会影响排敏进度' : '删除记录？',
            content: baseContent,
            confirmText: '删除',
            confirmColor: '#E57373',
            cancelText: '保留',
            success: (res) => {
                if (!res.confirm)
                    return;
                (0, journal_1.unlogMeal)(date, idx);
                wx.showToast({ title: willLoseTryingDay ? '已删除,排敏天 -1' : '已删除', icon: 'none', duration: 1200 });
                that.refresh();
            }
        });
    },
    openReactionMenu(e) {
        const id = e.currentTarget.dataset.id;
        const that = this;
        const reactions = (0, reactions_1.getReactions)();
        const r = reactions.find(x => x.id === id);
        if (!r)
            return;
        const items = [];
        if (r.resolvedAt)
            items.push('撤销消退');
        else
            items.push('标记已消退');
        items.push('删除反应');
        wx.showActionSheet({
            itemList: items,
            success: (res) => {
                const choice = items[res.tapIndex];
                if (choice === '标记已消退') {
                    (0, reactions_1.updateReaction)(id, { resolvedAt: new Date().toISOString() });
                    wx.showToast({ title: '已标记消退', icon: 'success' });
                    that.refresh();
                }
                else if (choice === '撤销消退') {
                    (0, reactions_1.updateReaction)(id, { resolvedAt: undefined });
                    wx.showToast({ title: '已撤销', icon: 'success' });
                    that.refresh();
                }
                else if (choice === '删除反应') {
                    wx.showModal({
                        title: '删除反应？',
                        content: '将从反应日志中移除，无法撤销。',
                        confirmText: '删除',
                        confirmColor: '#E57373',
                        success: (cr) => {
                            if (cr.confirm) {
                                (0, reactions_1.removeReaction)(id);
                                wx.showToast({ title: '已删除', icon: 'none' });
                                that.refresh();
                            }
                        }
                    });
                }
            }
        });
    },
    openSearch() {
        this.setData({ searchOpen: true });
    },
    closeSearch() {
        this.setData({ searchOpen: false });
    },
    onSearchInput(e) {
        this.setData({ searchKeyword: e.detail.value });
    },
    doSearch() {
        this.refresh();
        this.setData({ searchOpen: false });
    },
    clearSearch() {
        this.setData({ searchKeyword: '' });
        this.refresh();
    },
    toggleFabMenu() {
        this.setData({ fabMenuOpen: !this.data.fabMenuOpen });
    },
    fabAddMeal() {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        this.setData({
            fabMenuOpen: false,
            manualOpen: true,
            manualIsEditing: false,
            manualEditDate: '',
            manualEditMealIndex: -1,
            manualDate: today,
            todayStr: today,
            manualTime: `${hh}:${mm}`,
            manualDishName: '',
            manualIngredientsText: '',
            manualIngChips: [],
            manualIngInput: '',
            manualIngSuggestions: this.computeIngSuggestions([]),
            manualPortion: '',
            manualNote: ''
        });
    },
    openManualSheetForEdit(date, idx) {
        const log = (0, journal_1.getJournal)().find(l => l.date === date && l.mealIndex === idx);
        if (!log)
            return;
        const t = new Date((0, journal_1.getMealTime)(log));
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const chips = (log.ingredients || []).filter(Boolean);
        const portion = (log.portion === 'small' ? 'taste' : log.portion) || '';
        this.setData({
            manualOpen: true,
            manualIsEditing: true,
            manualEditDate: date,
            manualEditMealIndex: idx,
            manualDate: date,
            todayStr: today,
            manualTime: `${hh}:${mm}`,
            manualDishName: log.customDishName || (log.recipeId?.startsWith('manual-') ? log.recipeName : ''),
            manualIngredientsText: chips.join('、'),
            manualIngChips: chips,
            manualIngInput: '',
            manualIngSuggestions: this.computeIngSuggestions(chips),
            manualPortion: portion,
            manualNote: log.note || ''
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
        const parts = raw.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean);
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
        const merged = this.data.manualIngChips.filter(c => c !== name);
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
            const parts = pending.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean);
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
        const doSave = () => {
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
            that.setData({ manualOpen: false, manualIsEditing: false });
            that.refresh();
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
                        syncPlan(result.profile);
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
        };
        doSave();
    },
    fabAddReaction() {
        this.setData({ fabMenuOpen: false });
        wx.navigateTo({ url: '/pages/reaction-new/reaction-new' });
    },
    exportRecords() {
        wx.showActionSheet({
            itemList: ['导出饮食日记', '导出反应日志', '导出全部'],
            success: (res) => {
                const scope = ['journal', 'reaction', 'all'][res.tapIndex];
                const text = this.buildExportText(scope);
                if (!text.trim()) {
                    wx.showToast({ title: '暂无记录可导出', icon: 'none' });
                    return;
                }
                wx.setClipboardData({
                    data: text,
                    success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success', duration: 1400 })
                });
            }
        });
    },
    buildExportText(scope) {
        const today = new Date();
        const head = `辅食搭子 · 喂养记录 · 导出于 ${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}\n`;
        const parts = [head];
        const allLogs = (0, journal_1.getJournal)().sort((a, b) => b.date.localeCompare(a.date) || a.mealIndex - b.mealIndex);
        const allReactions = (0, reactions_1.getReactions)().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        if (scope === 'journal' || scope === 'all') {
            parts.push('\n========== 饮食日记 ==========\n');
            if (allLogs.length === 0) {
                parts.push('(无记录)\n');
            }
            else {
                const groupMap = {};
                for (const log of allLogs) {
                    if (!groupMap[log.date])
                        groupMap[log.date] = [];
                    groupMap[log.date].push(log);
                }
                for (const date of Object.keys(groupMap).sort((a, b) => b.localeCompare(a))) {
                    parts.push(`\n${this.shortDate(date)} 周${(0, planner_1.getWeekday)(date)}`);
                    for (const log of groupMap[date]) {
                        const customTag = log.isCustom ? ' [实际]' : '';
                        const pref = log.preference ? ` · ${journal_1.PREFERENCE_EMOJI[log.preference]} ${journal_1.PREFERENCE_LABEL[log.preference]}` : '';
                        const portion = log.portion ? ` · ${journal_1.PORTION_EMOJI[log.portion]} ${journal_1.PORTION_LABEL[log.portion]}` : '';
                        const dish = log.customDishName || log.recipeName;
                        const ings = (log.ingredients || []).join('、');
                        parts.push(`  第${log.mealIndex + 1}餐 ${dish}${customTag}${pref}${portion}` + (ings ? `\n    食材: ${ings}` : ''));
                        if (log.isCustom && log.customDishName)
                            parts.push(`    计划: ${log.recipeName}`);
                        if (log.note)
                            parts.push(`    备注: ${log.note}`);
                    }
                    parts.push('');
                }
            }
        }
        if (scope === 'reaction' || scope === 'all') {
            parts.push('\n========== 反应日志 ==========\n');
            if (allReactions.length === 0) {
                parts.push('(无记录)\n');
            }
            else {
                for (const r of allReactions) {
                    const t = new Date(r.occurredAt);
                    const dateTime = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
                    parts.push(`\n${dateTime} · ${reactions_1.REACTION_TYPE_EMOJI[r.type]} ${reactions_1.REACTION_TYPE_LABEL[r.type]} · ${reactions_1.SEVERITY_LABEL[r.severity]}`);
                    if (r.note)
                        parts.push(`  备注: ${r.note}`);
                    if (r.suspectedFoods && r.suspectedFoods.length > 0)
                        parts.push(`  可疑食材: ${r.suspectedFoods.join('、')}`);
                    parts.push(r.resolvedAt ? `  状态: 已消退` : `  状态: 未消退`);
                }
            }
        }
        parts.push('\n----\n本记录由「辅食搭子」生成,仅供参考。');
        return parts.join('\n');
    }
});
