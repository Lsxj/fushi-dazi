"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const agentRouting_1 = require("../../utils/agentRouting");
const safety_1 = require("../../utils/safety");
const MAX_HISTORY = 20;
let nextId = 1;
let cloudAvailable = false;
Page({
    data: {
        messages: [],
        draft: '',
        loading: false,
        scrollIntoView: '',
        backendMode: 'init',
        localSynced: false,
    },
    onLoad() {
        this.initBackend();
    },
    initBackend() {
        if (!wx.cloud) {
            console.warn('ai-chat: wx.cloud is not available, falling back to mock');
            this.setData({ backendMode: 'mock' });
            return;
        }
        try {
            wx.cloud.init({ traceUser: true });
            cloudAvailable = true;
            this.setData({ backendMode: 'cloud' });
        }
        catch (err) {
            console.warn('ai-chat: cloud init failed, falling back to mock:', err);
            this.setData({ backendMode: 'mock' });
        }
    },
    onInput(e) {
        this.setData({ draft: e.detail.value });
    },
    onQuickTap(e) {
        const text = e.currentTarget.dataset.text;
        this.setData({ draft: text });
        this.onSend();
    },
    onToggleTrace(e) {
        const id = e.currentTarget.dataset.id;
        const messages = this.data.messages.map((m) => m.id === id ? { ...m, traceExpanded: !m.traceExpanded } : m);
        this.setData({ messages });
    },
    async onSend() {
        const question = (this.data.draft || '').trim();
        if (!question) {
            wx.showToast({ title: '写点什么再发吧', icon: 'none', duration: 1200 });
            return;
        }
        if (this.data.loading)
            return;
        const userMsg = { id: nextId++, role: 'user', content: question, contentHtml: renderMarkdown(question) };
        const messages = [...this.data.messages, userMsg];
        this.setData({
            messages,
            draft: '',
            loading: true,
            scrollIntoView: `msg-${userMsg.id}`,
        });
        const history = messages.slice(-MAX_HISTORY, -1).map((m) => ({
            role: m.role,
            content: m.content,
        }));
        if (cloudAvailable) {
            try {
                const res = await wx.cloud.callFunction({
                    name: 'chat-ai',
                    data: {
                        question,
                        history,
                        _localBackup: this.collectLocalBackup(),
                    },
                });
                const result = res.result || {};
                if (!result.ok) {
                    this.appendAssistant(`出错了:${result.error || '未知错误'}`);
                    return;
                }
                this.applyCloudSnapshot(result.storageSnapshot);
                if (!this.data.localSynced)
                    this.setData({ localSynced: true });
                const toolCalls = (result.toolCalls ?? []).map((tc) => ({
                    name: tc.name,
                    input: tc.input ?? {},
                    inputJson: JSON.stringify(tc.input ?? {}, null, 2),
                    ok: !!tc.ok,
                }));
                this.appendAssistant(result.answer || '(AI 没回答)', toolCalls);
            }
            catch (err) {
                const msg = err?.errMsg || err.message || String(err);
                wx.showToast({ title: '发送失败,稍后再试', icon: 'none', duration: 1800 });
                this.appendAssistant(`云函数调用失败:${msg}(可能云函数没部署,详见 cloudfunctions/chat-ai/deploy.md)`, undefined, { error: true, retryQuestion: question });
            }
            finally {
                this.setData({ loading: false });
            }
        }
        else {
            this.runMock(question);
        }
    },
    collectLocalBackup() {
        const KEYS = [
            'babyProfile',
            'fridge',
            'manualShopList',
            'mealJournal',
            'reactions',
            'customFoods',
            'weeklyPlan',
        ];
        const out = {};
        for (const k of KEYS) {
            try {
                const v = wx.getStorageSync(k);
                if (v !== '' && v !== undefined && v !== null)
                    out[k] = v;
            }
            catch (_e) {
            }
        }
        return out;
    },
    applyCloudSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object')
            return;
        for (const [key, value] of Object.entries(snapshot)) {
            try {
                if (value !== undefined && value !== null) {
                    const local = wx.getStorageSync(key);
                    if (shouldKeepLocalValue(local, value)) {
                        console.warn(`ai-chat: skipped empty cloud snapshot for key=${key}`);
                        continue;
                    }
                    wx.setStorageSync(key, value);
                }
            }
            catch (err) {
                console.warn(`ai-chat: failed to apply cloud snapshot key=${key}:`, err);
            }
        }
    },
    runMock(question) {
        const ANSWERS = {
            generate_today_menu: '当前为离线降级模式，不会生成或写入真实菜单。服务恢复后可运行确定性菜单工具。',
            record_reaction: '当前为离线降级模式，不会写入真实反应记录。服务恢复后可运行反应分析工具。',
            read_baby_profile: '当前为离线降级模式，不展示虚构档案；请以「我的」页面中的实际档案为准。',
            list_recipes: '当前为离线降级模式，不返回虚构数量；请前往食谱页查看实际适用食谱。',
            get_feeding_history: '我会先读取已记录的辅食打卡和反应记录,再按时间总结。当前为离线降级模式,真实数据以服务恢复后的结果为准。',
        };
        setTimeout(() => {
            const route = (0, agentRouting_1.routeAgentRequest)(question) ?? {
                name: 'read_baby_profile',
                input: {},
            };
            let answer = ANSWERS[route.name] || '好的,我帮你处理。';
            if (route.name === 'check_food_safety') {
                const profile = wx.getStorageSync('babyProfile');
                const foods = Array.isArray(route.input.foods)
                    ? route.input.foods.filter((food) => typeof food === 'string')
                    : [];
                if (!profile || foods.length === 0) {
                    answer = '本地 mock 没有拿到完整的安全档案，暂时不能判断是否适合尝试。';
                }
                else {
                    const result = (0, safety_1.checkFoodsSafety)(foods, profile);
                    answer = result.safe
                        ? '确定性安全规则未发现阻断项。首次引入仍建议小份尝试，并按排敏流程观察。'
                        : `确定性安全规则已阻断这次尝试：${result.results
                            .filter((item) => !item.safe)
                            .map((item) => item.reason)
                            .filter(Boolean)
                            .join('；')}。请不要喂食。`;
                }
            }
            this.appendAssistant(answer, [
                {
                    name: route.name,
                    input: route.input,
                    inputJson: JSON.stringify(route.input, null, 2),
                    ok: true,
                },
            ]);
            this.setData({ loading: false });
        }, 600);
    },
    appendAssistant(content, toolCalls, extra) {
        const msg = {
            id: nextId++,
            role: 'assistant',
            content,
            contentHtml: renderMarkdown(content),
            toolCalls: toolCalls && toolCalls.length ? toolCalls : undefined,
            traceExpanded: false,
            ...(extra?.error ? { error: true } : {}),
            ...(extra?.retryQuestion ? { retryQuestion: extra.retryQuestion } : {}),
        };
        const messages = [...this.data.messages, msg];
        this.setData({
            messages,
            scrollIntoView: `msg-${msg.id}`,
        });
    },
    onRetry(e) {
        const id = e.currentTarget.dataset.id;
        const target = this.data.messages.find((m) => m.id === id);
        if (!target || !target.retryQuestion)
            return;
        const idx = this.data.messages.findIndex((m) => m.id === id);
        if (idx <= 0)
            return;
        const prev = this.data.messages[idx - 1];
        if (prev.role !== 'user')
            return;
        const trimmed = this.data.messages.slice(0, idx - 1);
        this.setData({ messages: trimmed, draft: target.retryQuestion });
        setTimeout(() => this.onSend(), 0);
    },
});
function renderMarkdown(text) {
    if (!text)
        return '';
    let s = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const lines = s.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trimEnd();
        if (looksLikeTableRow(line) && i + 1 < lines.length && looksLikeTableSeparator(lines[i + 1])) {
            const headerCells = parseTableRow(line);
            i += 2;
            const bodyCells = [];
            while (i < lines.length && looksLikeTableRow(lines[i])) {
                bodyCells.push(parseTableRow(lines[i]));
                i++;
            }
            out.push(renderTable(headerCells, bodyCells));
            continue;
        }
        if (/^#\s+/.test(line)) {
            out.push(`<b style="color:#FF6B35;font-size:32rpx;">${formatInline(line.replace(/^#\s+/, ''))}</b>`);
        }
        else if (/^[-*]\s+/.test(line)) {
            out.push(`<div style="margin:2rpx 0;">• ${formatInline(line.replace(/^[-*]\s+/, ''))}</div>`);
        }
        else if (/^\d+\.\s+/.test(line)) {
            out.push(`<div style="margin:2rpx 0;">${formatInline(line)}</div>`);
        }
        else {
            out.push(formatInline(line));
        }
        i++;
    }
    return `<div>${out.join('<br>')}</div>`;
}
function shouldKeepLocalValue(local, incoming) {
    if (Array.isArray(local) && local.length > 0 && Array.isArray(incoming) && incoming.length === 0) {
        return true;
    }
    if (isPlainObject(local) && Object.keys(local).length > 0 && isPlainObject(incoming) && Object.keys(incoming).length === 0) {
        return true;
    }
    if (isBabyProfile(local) && isPlainObject(incoming) && !isBabyProfile(incoming)) {
        return true;
    }
    return false;
}
function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isBabyProfile(value) {
    return isPlainObject(value) && typeof value.babyName === 'string' && typeof value.birthday === 'string';
}
function looksLikeTableRow(line) {
    const t = line.trim();
    return t.startsWith('|') && t.endsWith('|') && t.slice(1, -1).includes('|');
}
function looksLikeTableSeparator(line) {
    return /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(line.trim());
}
function parseTableRow(line) {
    const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return t.split('|').map((c) => c.trim());
}
function renderTable(header, body) {
    const width = header.length;
    const normalize = (row) => {
        const padded = row.slice(0, width);
        while (padded.length < width)
            padded.push('');
        return padded;
    };
    const cellStyle = 'border:1rpx solid #FFEAD5;padding:8rpx 12rpx;text-align:left;';
    const thStyle = cellStyle + 'background:#FFF5EB;font-weight:500;';
    const head = '<tr>' +
        header.map((h) => `<th style="${thStyle}">${formatInline(h)}</th>`).join('') +
        '</tr>';
    const rows = body
        .map((r) => '<tr>' +
        normalize(r).map((c) => `<td style="${cellStyle}">${formatInline(c)}</td>`).join('') +
        '</tr>')
        .join('');
    return ('<table style="border-collapse:collapse;width:100%;' +
        'font-size:24rpx;margin:8rpx 0;">' +
        '<thead>' + head + '</thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table>');
}
function formatInline(s) {
    return s
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/(?<![*\\])\*([^*\n]+?)\*(?!\*)/g, '<i>$1</i>');
}
