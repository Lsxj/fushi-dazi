export type SupportCaseReason =
  | 'unsafe-food-in-menu'
  | 'ai-safety-warning-missing'
  | 'inventory-not-updated'
  | 'profile-not-refreshed'
  | 'request-cloud-data-deletion'

export type SupportCaseStatus =
  | 'new'
  | 'investigating'
  | 'escalated'
  | 'resolved'
  | 'closed'

export const SUPPORT_STATUS_LABELS: Record<SupportCaseStatus, string> = {
  new: '待处理',
  investigating: '处理中',
  escalated: '安全复核中',
  resolved: '已解决',
  closed: '已关闭',
}

export function getSupportStatusLabel(status: string): string {
  return SUPPORT_STATUS_LABELS[status as SupportCaseStatus] ?? '状态未知'
}

export interface SupportCasePayload {
  reason: SupportCaseReason
  context: {
    clientVersion: string
    occurredAt: string
    menuDate?: string
    traceId?: string
    profileVersion?: number
  }
  consentToUploadDiagnostics: true
}

export interface SupportCaseReceipt {
  caseId: string
  trackingToken: string
  status: string
  reason: SupportCaseReason
  submittedAt: string
}

export const SUPPORT_REASON_OPTIONS: Array<{
  value: SupportCaseReason
  label: string
  hint: string
}> = [
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
]

export function buildSupportCasePayload(
  reason: SupportCaseReason,
  occurredAt: string,
  diagnostics: {
    menuDate?: string
    traceId?: string
    profileVersion?: number
  } = {}
): SupportCasePayload {
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
  }
}
