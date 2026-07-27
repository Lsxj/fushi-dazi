"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const journal_1 = require("../../utils/journal");
const planner_1 = require("../../utils/planner");
Page({
    data: {
        totalCount: 0,
        groupedLogs: []
    },
    onShow() {
        this.refresh();
    },
    refresh() {
        const all = (0, journal_1.getJournal)();
        all.sort((a, b) => b.date.localeCompare(a.date) || b.mealIndex - a.mealIndex);
        const grouped = {};
        for (const log of all) {
            if (!grouped[log.date])
                grouped[log.date] = [];
            grouped[log.date].push(log);
        }
        const days = Object.keys(grouped)
            .sort((a, b) => b.localeCompare(a))
            .map(date => ({
            date,
            dateLabel: this.shortDate(date),
            weekday: (0, planner_1.getWeekday)(date),
            logs: grouped[date]
                .sort((a, b) => a.mealIndex - b.mealIndex)
                .map(log => ({
                ...log,
                prefEmoji: log.preference ? journal_1.PREFERENCE_EMOJI[log.preference] : '',
                prefLabel: log.preference ? journal_1.PREFERENCE_LABEL[log.preference] : ''
            }))
        }));
        this.setData({
            totalCount: all.length,
            groupedLogs: days
        });
    },
    shortDate(dateStr) {
        const parts = dateStr.split('-');
        return `${parts[1]}/${parts[2]}`;
    }
});
