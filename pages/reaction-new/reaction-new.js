"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reactions_1 = require("../../utils/reactions");
const observation_1 = require("../../utils/observation");
const planner_1 = require("../../utils/planner");
const reviewStats_1 = require("../../utils/reviewStats");
const TYPE_OPTIONS = Object.keys(reactions_1.REACTION_TYPE_LABEL).map(v => ({
    value: v,
    label: reactions_1.REACTION_TYPE_LABEL[v],
    emoji: reactions_1.REACTION_TYPE_EMOJI[v]
}));
const SEVERITY_OPTIONS = [
    { value: 'mild', label: '轻微' },
    { value: 'moderate', label: '中度' },
    { value: 'severe', label: '严重' }
];
const TIME_OPTIONS = [
    { value: 'now', label: '刚刚' },
    { value: 'today_morning', label: '今天上午' },
    { value: 'today_afternoon', label: '今天下午' },
    { value: 'today_evening', label: '今天晚上' },
    { value: 'yesterday', label: '昨天' },
    { value: 'custom', label: '自定义' }
];
const LEVEL_LABEL = { high: '高度可疑', medium: '中等', low: '可能性低' };
Page({
    data: {
        editingId: '',
        isEditing: false,
        typeOptions: TYPE_OPTIONS,
        selectedTypes: {},
        severityOptions: SEVERITY_OPTIONS,
        severity: 'mild',
        timeOptions: TIME_OPTIONS,
        timeChoice: 'now',
        customTimeRange: [],
        customTimeIndex: [0, 0, 0],
        customTimeLabel: '',
        note: '',
        noteLength: 0,
        traceback: [],
        suspects: [],
        willDirectAllergic: false
    },
    onLoad(query) {
        this.buildCustomTimeRange();
        if (query && query.id) {
            this.loadForEdit(query.id);
        }
        else {
            this.refreshTraceback();
        }
    },
    loadForEdit(id) {
        const existing = (0, reactions_1.getReactions)().find(r => r.id === id);
        if (!existing) {
            wx.showToast({ title: '记录不存在', icon: 'none' });
            setTimeout(() => wx.navigateBack(), 800);
            return;
        }
        const selectedTypes = {};
        selectedTypes[existing.type] = true;
        this.setData({
            editingId: id,
            isEditing: true,
            selectedTypes,
            severity: existing.severity,
            timeChoice: 'now',
            note: existing.note || '',
            noteLength: (existing.note || '').length
        });
        this.updateWillDirectAllergic();
        const reactionTime = existing.occurredAt;
        this.refreshTracebackWith(reactionTime, existing.suspectedFoods || []);
    },
    buildCustomTimeRange() {
        const days = [];
        const today = new Date();
        for (let i = 0; i < 4; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            days.push(`${d.getMonth() + 1}/${d.getDate()} 周${(0, planner_1.getWeekday)(d.toISOString().slice(0, 10))}`);
        }
        const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}时`);
        const minutes = ['00', '15', '30', '45'];
        this.setData({ customTimeRange: [days, hours, minutes] });
    },
    toggleType(e) {
        const v = e.currentTarget.dataset.value;
        const cur = { ...this.data.selectedTypes };
        cur[v] = !cur[v];
        this.setData({ selectedTypes: cur });
        this.updateWillDirectAllergic();
    },
    setSeverity(e) {
        this.setData({ severity: e.currentTarget.dataset.value });
        this.updateWillDirectAllergic();
        this.recomputeSuspectActions();
    },
    updateWillDirectAllergic() {
        const types = Object.keys(this.data.selectedTypes).filter(k => this.data.selectedTypes[k]);
        const direct = types.some(t => (0, reactions_1.isSeverDirectAllergic)(this.data.severity, t));
        this.setData({ willDirectAllergic: direct });
    },
    setTime(e) {
        const v = e.currentTarget.dataset.value;
        this.setData({ timeChoice: v });
        if (v !== 'custom')
            this.refreshTraceback();
    },
    onCustomTime(e) {
        this.setData({ customTimeIndex: e.detail.value });
        const [d, h, m] = e.detail.value;
        const days = this.data.customTimeRange[0];
        const hours = this.data.customTimeRange[1];
        const minutes = this.data.customTimeRange[2];
        this.setData({ customTimeLabel: `${days[d]} ${hours[h]}${minutes[m]}` });
        this.refreshTraceback();
    },
    onNoteInput(e) {
        const value = e.detail.value;
        this.setData({ note: value, noteLength: value.length });
    },
    resolveReactionTime() {
        const now = new Date();
        if (this.data.timeChoice === 'now')
            return now.toISOString();
        if (this.data.timeChoice === 'today_morning') {
            now.setHours(9, 0, 0, 0);
            return now.toISOString();
        }
        if (this.data.timeChoice === 'today_afternoon') {
            now.setHours(14, 0, 0, 0);
            return now.toISOString();
        }
        if (this.data.timeChoice === 'today_evening') {
            now.setHours(20, 0, 0, 0);
            return now.toISOString();
        }
        if (this.data.timeChoice === 'yesterday') {
            now.setDate(now.getDate() - 1);
            now.setHours(20, 0, 0, 0);
            return now.toISOString();
        }
        if (this.data.timeChoice === 'custom') {
            const [d, h, m] = this.data.customTimeIndex;
            const today = new Date();
            today.setDate(today.getDate() - d);
            today.setHours(h, parseInt(['00', '15', '30', '45'][m], 10), 0, 0);
            return today.toISOString();
        }
        return now.toISOString();
    },
    refreshTraceback() {
        const reactionTime = this.resolveReactionTime();
        this.refreshTracebackWith(reactionTime, []);
    },
    refreshTracebackWith(reactionTime, preselectFoods) {
        const meals = (0, reactions_1.traceback72h)(reactionTime);
        const traceback = meals.map(m => {
            const t = new Date(m.eatenAt || m.loggedAt);
            const dateStr = `${t.getMonth() + 1}/${t.getDate()}`;
            const timeStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
            return {
                key: `${m.date}-${m.mealIndex}`,
                timeLabel: `${dateStr} ${timeStr}`,
                recipeName: m.recipeName,
                ingsText: m.ingredients.join(' + ')
            };
        });
        const profile = wx.getStorageSync('babyProfile');
        const allIngs = [];
        for (const m of meals) {
            for (const ing of m.ingredients) {
                if (!allIngs.includes(ing))
                    allIngs.push(ing);
            }
        }
        const preselectSet = new Set(preselectFoods);
        const suspects = (0, observation_1.analyzeSuspects)(profile, allIngs, reactionTime).map(s => {
            const wasSelected = preselectSet.has(s.name);
            let action = '';
            if (wasSelected) {
                action = 'observe';
            }
            else if (s.level === 'high') {
                action = 'observe';
            }
            return {
                ...s,
                levelLabel: LEVEL_LABEL[s.level],
                emoji: (0, reviewStats_1.getIngredientEmoji)(s.name),
                action
            };
        });
        this.setData({ traceback, suspects });
    },
    recomputeSuspectActions() {
    },
    setSuspectAction(e) {
        const name = e.currentTarget.dataset.name;
        const action = e.currentTarget.dataset.action;
        const suspects = this.data.suspects.map(s => {
            if (s.name !== name)
                return s;
            return { ...s, action: s.action === action ? '' : action };
        });
        this.setData({ suspects });
    },
    submit() {
        const types = Object.keys(this.data.selectedTypes).filter(k => this.data.selectedTypes[k]);
        if (types.length === 0) {
            wx.showToast({ title: '请选择至少一个反应类型', icon: 'none' });
            return;
        }
        const reactionTime = this.resolveReactionTime();
        const checkedSuspects = this.data.suspects.filter(s => s.action !== '');
        const checkedNames = checkedSuspects.map(s => s.name);
        let profile = wx.getStorageSync('babyProfile');
        if (this.data.isEditing && this.data.editingId) {
            const existing = (0, reactions_1.getReactions)().find(r => r.id === this.data.editingId);
            if (!existing) {
                wx.showToast({ title: '记录已被删除', icon: 'none' });
                setTimeout(() => wx.navigateBack(), 800);
                return;
            }
            (0, reactions_1.updateReaction)(this.data.editingId, {
                type: types[0],
                severity: this.data.severity,
                note: this.data.note,
                suspectedFoods: checkedNames
            });
            wx.showToast({ title: '已更新', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 800);
            return;
        }
        const reactions = [];
        for (const type of types) {
            const reactionId = `r-${Date.now()}-${type}`;
            const log = {
                id: reactionId,
                occurredAt: reactionTime,
                type,
                severity: this.data.severity,
                note: this.data.note,
                tracebackMeals: this.data.traceback.map((t) => {
                    const meal = (0, reactions_1.traceback72h)(reactionTime).find(m => `${m.date}-${m.mealIndex}` === t.key);
                    return meal ? { date: meal.date, mealIndex: meal.mealIndex, recipeName: meal.recipeName, ingredients: meal.ingredients } : null;
                }).filter(Boolean),
                suspectedFoods: checkedNames
            };
            reactions.push(log);
            (0, reactions_1.addReaction)(log);
        }
        const isSevere = types.some(t => (0, reactions_1.isSeverDirectAllergic)(this.data.severity, t));
        const reactionId = reactions[0].id;
        for (const s of checkedSuspects) {
            if (isSevere) {
                profile = (0, observation_1.markAllergic)(profile, s.name, reactionId);
            }
            else if (s.action === 'pause3') {
                profile = (0, observation_1.enterObservation)(profile, s.name, reactionId, undefined, 3);
            }
            else {
                profile = (0, observation_1.enterObservation)(profile, s.name, reactionId);
            }
        }
        wx.setStorageSync('babyProfile', profile);
        (0, planner_1.rebuildPlanPreservingLoggedMeals)(profile);
        if (types.includes('gut')) {
            wx.showToast({ title: '已记录,菜单将自动避开海鲜/高纤维', icon: 'none', duration: 2200 });
        }
        const observeCount = checkedSuspects.filter(s => s.action === 'observe').length;
        const pauseCount = checkedSuspects.filter(s => s.action === 'pause3').length;
        let tip = '已记录反应';
        if (isSevere && checkedNames.length > 0) {
            tip = `已确诊 ${checkedNames.length} 个食物为过敏(永久排除)`;
        }
        else if (observeCount + pauseCount > 0) {
            const parts = [];
            if (observeCount > 0)
                parts.push(`${observeCount} 个加观察期(7 天)`);
            if (pauseCount > 0)
                parts.push(`${pauseCount} 个暂停 3 天`);
            tip = `已为 ${parts.join('、')}`;
        }
        wx.showToast({ title: tip, icon: 'none', duration: 2000 });
        setTimeout(() => {
            wx.navigateBack();
        }, 2000);
    },
    cancel() {
        wx.navigateBack();
    }
});
