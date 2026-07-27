"use strict";
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
        const KEYWORD_TOOL = [
            { re: /今天.*吃什么|今天.*菜单|中午|早上|晚上|晚餐|早餐/, name: 'generate_today_menu' },
            { re: /这周|本周|最近.*吃|吃过|记录|回顾|总结|历史|打卡/, name: 'get_feeding_history' },
            { re: /换|替换|别的/, name: 'generate_today_menu' },
            { re: /拉稀|红疹|呕吐|发烧|嗜睡|便秘|反应/, name: 'record_reaction' },
            { re: /试试|尝试|引入|新食材/, name: 'check_food_safety' },
            { re: /档案|月龄|状态|过敏|现在/, name: 'read_baby_profile' },
            { re: /哪些菜|食谱|菜单|推荐|能吃/, name: 'list_recipes' },
        ];
        const ANSWERS = {
            generate_today_menu: '今天三餐我帮你安排好了:\n• 早餐: 牛肉南瓜粥\n• 午餐: 鳕鱼西兰花米糊\n• 下午: 香蕉苹果泥\n\n都用了你冰箱里的食材。',
            record_reaction: '看起来像是中度反应,我先帮你记下来,建议进入 7 天观察期。',
            check_food_safety: '我帮你查了 — 安全。但这是首次引入,建议小份试,观察 4 小时。',
            read_baby_profile: '小蘑菇 10 月龄,fish/cruciferous/leafy 几个品类都开放。',
            list_recipes: '我帮你列了 17 道 applicable 的菜 — 要看哪一类?',
            get_feeding_history: '我会先读取已记录的辅食打卡和反应记录,再按时间总结。当前是本地预览 mock,真实数据以云函数返回为准。',
        };
        setTimeout(() => {
            const match = KEYWORD_TOOL.find((k) => k.re.test(question));
            let toolName;
            let input = {};
            if (!match) {
                toolName = 'read_baby_profile';
            }
            else {
                toolName = match.name;
                if (toolName === 'record_reaction') {
                    input = { type: 'rash', severity: 'moderate', occurredAt: new Date().toISOString() };
                }
                else if (toolName === 'check_food_safety') {
                    const m = question.match(/试试\s*(\S+)/);
                    input = { foods: [m ? m[1] : '虾'] };
                }
            }
            this.appendAssistant(ANSWERS[toolName] || '好的,我帮你处理。', [
                { name: toolName, input, inputJson: JSON.stringify(input, null, 2), ok: true },
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
