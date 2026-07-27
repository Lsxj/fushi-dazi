"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reactions_1 = require("../../utils/reactions");
const planner_1 = require("../../utils/planner");
Page({
    data: {
        days: [],
        total: 0,
        unresolvedCount: 0
    },
    onShow() {
        this.refresh();
    },
    refresh() {
        const all = (0, reactions_1.getReactions)();
        all.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        const groups = {};
        let unresolved = 0;
        for (const r of all) {
            const t = new Date(r.occurredAt);
            const dateKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
            const dateLabel = `${t.getMonth() + 1}/${t.getDate()} 周${(0, planner_1.getWeekday)(dateKey)}`;
            const timeOnly = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
            const resolvedLabel = r.resolvedAt
                ? new Date(r.resolvedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
                : '';
            const vm = {
                id: r.id,
                timeOnly,
                typesDisplay: [`${reactions_1.REACTION_TYPE_EMOJI[r.type]} ${reactions_1.REACTION_TYPE_LABEL[r.type]}`],
                severity: r.severity,
                severityLabel: reactions_1.SEVERITY_LABEL[r.severity],
                note: r.note || '',
                suspectedFoods: r.suspectedFoods || [],
                tracebackCount: (r.tracebackMeals || []).length,
                resolved: !!r.resolvedAt,
                resolvedLabel
            };
            if (!vm.resolved)
                unresolved++;
            if (!groups[dateKey])
                groups[dateKey] = { date: dateKey, dateLabel, events: [] };
            groups[dateKey].events.push(vm);
        }
        const days = Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
        this.setData({
            days,
            total: all.length,
            unresolvedCount: unresolved
        });
    },
    editReaction(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: `/pages/reaction-new/reaction-new?id=${id}` });
    },
    markResolved(e) {
        const id = e.currentTarget.dataset.id;
        (0, reactions_1.updateReaction)(id, { resolvedAt: new Date().toISOString() });
        wx.showToast({ title: '已标记消退', icon: 'success' });
        this.refresh();
    },
    undoResolved(e) {
        const id = e.currentTarget.dataset.id;
        wx.showModal({
            title: '撤销消退标记',
            content: '反应将重新显示为"未消退"',
            success: (res) => {
                if (!res.confirm)
                    return;
                (0, reactions_1.updateReaction)(id, { resolvedAt: undefined });
                wx.showToast({ title: '已撤销', icon: 'success' });
                this.refresh();
            }
        });
    },
    confirmDelete(e) {
        const id = e.currentTarget.dataset.id;
        wx.showModal({
            title: '删除反应记录',
            content: '确认删除?(不会撤销已加的观察期)',
            success: (res) => {
                if (!res.confirm)
                    return;
                (0, reactions_1.removeReaction)(id);
                wx.showToast({ title: '已删除', icon: 'success' });
                this.refresh();
            }
        });
    }
});
