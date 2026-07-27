"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const planner_1 = require("../../utils/planner");
const reactions_1 = require("../../utils/reactions");
const dateUtil_1 = require("../../utils/dateUtil");
const backup_1 = require("../../utils/backup");
Page({
    data: {
        babyName: '',
        birthday: '',
        birthdayLabel: '',
        today: '',
        ageMonths: 0,
        mealsPerDay: 0,
        editing: { name: false },
        openCount: 0,
        confirmedCount: 0,
        pills: []
    },
    onShow() {
        this.refresh();
        if (this.getTabBar) {
            const tb = this.getTabBar();
            if (tb)
                tb.setData({ selected: 4 });
        }
    },
    refresh() {
        const profile = wx.getStorageSync('babyProfile');
        if (!profile)
            return;
        let ageMonths = profile.ageMonths;
        if (profile.birthday) {
            ageMonths = (0, planner_1.calcAgeMonths)(profile.birthday);
        }
        const openCount = Object.values(profile.categoryAllergies || {}).filter(c => c.state === 'open').length;
        const confirmedCount = (profile.confirmedFoods || []).length;
        const now = Date.now();
        const recentReactions24h = (0, reactions_1.getReactions)().filter(r => !r.resolvedAt && now - new Date(r.occurredAt).getTime() < 24 * 3600 * 1000);
        const pills = [];
        if (recentReactions24h.length > 0)
            pills.push({ label: '⚠️ 需观察', kind: 'needObs' });
        if ((0, planner_1.hasActiveGutReaction)() && recentReactions24h.length === 0)
            pills.push({ label: '🤒 肠胃恢复中', kind: 'gut' });
        if (profile.currentStatus === 'postVaccine' && profile.statusSince) {
            const daysIn = Math.floor((now - (0, dateUtil_1.parseLocalDateMs)(profile.statusSince)) / 86400000) + 1;
            pills.push({ label: `🛡️ 疫苗后第${daysIn}天`, kind: 'postVaccine' });
        }
        if (pills.length === 0)
            pills.push({ label: '✓ 正常', kind: 'normal' });
        this.setData({
            babyName: profile.babyName,
            birthday: profile.birthday || '',
            birthdayLabel: this.shortDate(profile.birthday || ''),
            today: new Date().toISOString().slice(0, 10),
            ageMonths,
            mealsPerDay: profile.mealsPerDay,
            openCount,
            confirmedCount,
            pills
        });
    },
    gotoIndex() {
        wx.switchTab({ url: '/pages/index/index' });
    },
    shortDate(s) {
        if (!s)
            return '未设置';
        const p = s.split('-');
        return `${p[1]}/${p[2]}`;
    },
    editName() {
        this.setData({ editing: { ...this.data.editing, name: true } });
    },
    commitName(e) {
        const value = (e.detail.value || '').trim();
        if (!value) {
            this.setData({ editing: { ...this.data.editing, name: false } });
            return;
        }
        const profile = wx.getStorageSync('babyProfile');
        profile.babyName = value;
        wx.setStorageSync('babyProfile', profile);
        this.setData({ babyName: value, editing: { ...this.data.editing, name: false } });
    },
    commitBirthday(e) {
        const value = e.detail.value;
        if (!value)
            return;
        const profile = wx.getStorageSync('babyProfile');
        profile.birthday = value;
        profile.ageMonths = (0, planner_1.calcAgeMonths)(value);
        wx.setStorageSync('babyProfile', profile);
        wx.removeStorageSync('weeklyPlan');
        wx.showToast({ title: '已更新', icon: 'none', duration: 1000 });
        this.refresh();
    },
    commitMeals(e) {
        const value = parseInt(e.detail.value, 10) + 1;
        const profile = wx.getStorageSync('babyProfile');
        profile.mealsPerDay = value;
        wx.setStorageSync('babyProfile', profile);
        wx.removeStorageSync('weeklyPlan');
        wx.showToast({ title: `已改为每日${value}顿`, icon: 'none', duration: 1000 });
        this.refresh();
    },
    exportBackup() {
        try {
            const backup = (0, backup_1.createDataBackup)();
            const text = (0, backup_1.serializeBackup)(backup);
            wx.setClipboardData({
                data: text,
                success: () => {
                    wx.showModal({
                        title: '备份已复制',
                        content: `${(0, backup_1.formatBackupSummary)(backup.summary)}\n\n请把剪贴板里的备份内容保存到微信收藏、备忘录或文件里。`,
                        showCancel: false,
                        confirmText: '知道了'
                    });
                },
                fail: () => {
                    wx.showToast({ title: '复制失败', icon: 'none' });
                }
            });
        }
        catch (err) {
            wx.showToast({ title: `备份失败:${err.message}`, icon: 'none' });
        }
    },
    restoreFromClipboard() {
        wx.getClipboardData({
            success: (clip) => {
                let backup;
                try {
                    backup = (0, backup_1.parseBackup)(clip.data || '');
                }
                catch (err) {
                    wx.showModal({
                        title: '没有找到可用备份',
                        content: err.message,
                        showCancel: false,
                        confirmText: '知道了'
                    });
                    return;
                }
                wx.showModal({
                    title: '恢复这份备份?',
                    content: `${(0, backup_1.formatBackupSummary)(backup.summary)}\n\n恢复会覆盖当前本机数据,恢复前会自动保存一份快照。`,
                    confirmText: '恢复',
                    confirmColor: '#E57373',
                    success: (res) => {
                        if (!res.confirm)
                            return;
                        try {
                            const result = (0, backup_1.restoreDataBackup)(backup);
                            wx.showToast({ title: `已恢复 ${result.restoredKeys.length} 项`, icon: 'none', duration: 1200 });
                            setTimeout(() => {
                                const profile = wx.getStorageSync('babyProfile');
                                if (profile)
                                    wx.reLaunch({ url: '/pages/index/index' });
                                else
                                    wx.reLaunch({ url: '/pages/welcome/welcome' });
                            }, 400);
                        }
                        catch (err) {
                            wx.showToast({ title: `恢复失败:${err.message}`, icon: 'none' });
                        }
                    }
                });
            },
            fail: () => {
                wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
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
    }
});
