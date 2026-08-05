"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORT_REASON_OPTIONS = void 0;
exports.buildSupportCasePayload = buildSupportCasePayload;
exports.SUPPORT_REASON_OPTIONS = [
    {
        value: 'unsafe-food-in-menu',
        label: '菜单出现疑似不安全食材',
        hint: '例如已经标记过敏的食材仍出现在菜单中',
    },
    {
        value: 'ai-safety-warning-missing',
        label: 'AI 回答缺少安全提醒',
        hint: '只提交问题类型和诊断标识，不提交完整聊天',
    },
    {
        value: 'inventory-not-updated',
        label: '打卡后库存没有更新',
        hint: '用于排查打卡、撤销和库存联动',
    },
    {
        value: 'profile-not-refreshed',
        label: '档案变更后页面没有刷新',
        hint: '用于排查本地状态或版本同步问题',
    },
    {
        value: 'request-cloud-data-deletion',
        label: '申请删除云端数据',
        hint: '提交后由支持人员确认处理范围和结果',
    },
];
function buildSupportCasePayload(reason, occurredAt, diagnostics = {}) {
    return {
        reason,
        context: {
            clientVersion: '1.0.4',
            occurredAt,
            ...(diagnostics.menuDate ? { menuDate: diagnostics.menuDate } : {}),
            ...(diagnostics.traceId ? { traceId: diagnostics.traceId } : {}),
            ...(diagnostics.profileVersion
                ? { profileVersion: diagnostics.profileVersion }
                : {}),
        },
        consentToUploadDiagnostics: true,
    };
}
