"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeAgentRequest = routeAgentRequest;
function extractTrialFood(text) {
    const match = text.match(/(?:试试|尝试|引入)\s*([^，。！？?\s]+)/);
    return match?.[1] ?? '虾';
}
function reactionType(text) {
    if (/呕吐/.test(text))
        return 'vomit';
    if (/发烧/.test(text))
        return 'fever';
    if (/嗜睡/.test(text))
        return 'sleepy';
    if (/便秘/.test(text))
        return 'constipation';
    if (/拉稀/.test(text))
        return 'gut';
    return 'rash';
}
function routeAgentRequest(text) {
    if (/今天.*吃什么|今天.*菜单|中午|早上|晚上|晚餐|早餐|换|替换|别的/.test(text)) {
        return { name: 'generate_today_menu', input: {} };
    }
    if (/这周|本周|最近.*吃|吃过|记录|回顾|总结|历史|打卡/.test(text)) {
        return { name: 'get_feeding_history', input: {} };
    }
    if (/拉稀|红疹|呕吐|发烧|嗜睡|便秘|反应/.test(text)) {
        return {
            name: 'record_reaction',
            input: {
                type: reactionType(text),
                severity: 'moderate',
                occurredAt: new Date().toISOString(),
            },
        };
    }
    if (/试试|尝试|引入|新食材/.test(text)) {
        return {
            name: 'check_food_safety',
            input: { foods: [extractTrialFood(text)] },
        };
    }
    if (/档案|月龄|状态|过敏|现在/.test(text)) {
        return { name: 'read_baby_profile', input: {} };
    }
    if (/哪些菜|食谱|菜单|推荐|能吃/.test(text)) {
        return { name: 'list_recipes', input: {} };
    }
    return null;
}
