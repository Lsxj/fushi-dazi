"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const support_1 = require("../../utils/support");
const supportTransport_1 = require("../../utils/supportTransport");
const RECEIPT_KEY = 'supportCaseReceipt';
Page({
    data: {
        reasons: support_1.SUPPORT_REASON_OPTIONS,
        selectedReason: '',
        consent: false,
        submitting: false,
        receipt: null,
        receiptStatusLabel: '',
        serviceMode: '云端支持服务',
    },
    onShow() {
        const receipt = wx.getStorageSync(RECEIPT_KEY);
        this.setData({
            receipt: receipt || null,
            receiptStatusLabel: receipt ? (0, support_1.getSupportStatusLabel)(receipt.status) : '',
        });
    },
    selectReason(event) {
        this.setData({ selectedReason: event.currentTarget.dataset.reason });
    },
    toggleConsent(event) {
        this.setData({ consent: event.detail.value });
    },
    async submitCase() {
        if (!this.data.selectedReason) {
            wx.showToast({ title: '请先选择问题类型', icon: 'none' });
            return;
        }
        if (!this.data.consent) {
            wx.showModal({
                title: '需要你的明确授权',
                content: '只有打开授权开关后，才会上传页面版本、时间和可选诊断标识。',
                showCancel: false,
            });
            return;
        }
        const reason = this.data.selectedReason;
        const payload = (0, support_1.buildSupportCasePayload)(reason, new Date().toISOString());
        this.setData({ submitting: true });
        try {
            const response = await (0, supportTransport_1.callSupportApi)('/api/v1/support/cases', payload);
            const body = response.data;
            if (response.statusCode !== 200 || !body.case || !body.trackingToken) {
                wx.showToast({ title: '提交失败，请稍后重试', icon: 'none' });
                return;
            }
            const receipt = {
                caseId: body.case.caseId,
                trackingToken: body.trackingToken,
                status: body.case.status,
                reason,
                submittedAt: new Date().toISOString(),
            };
            wx.setStorageSync(RECEIPT_KEY, receipt);
            this.setData({
                receipt,
                receiptStatusLabel: (0, support_1.getSupportStatusLabel)(receipt.status),
                consent: false,
            });
            wx.showToast({ title: '工单已提交', icon: 'success' });
        }
        catch (error) {
            console.warn('support case submission failed:', error);
            wx.showModal({
                title: '暂时无法提交',
                content: '云端支持服务暂时不可用，本次没有保存工单。请检查网络后重试。',
                showCancel: false,
            });
        }
        finally {
            this.setData({ submitting: false });
        }
    },
    async refreshStatus() {
        const receipt = this.data.receipt;
        if (!receipt)
            return;
        try {
            const response = await (0, supportTransport_1.callSupportApi)('/api/v1/support/cases/track', {
                caseId: receipt.caseId,
                trackingToken: receipt.trackingToken,
            });
            const body = response.data;
            if (response.statusCode !== 200 || !body.found || !body.case) {
                wx.showToast({ title: '没有查到工单', icon: 'none' });
                return;
            }
            const nextReceipt = { ...receipt, status: body.case.status };
            wx.setStorageSync(RECEIPT_KEY, nextReceipt);
            this.setData({
                receipt: nextReceipt,
                receiptStatusLabel: (0, support_1.getSupportStatusLabel)(nextReceipt.status),
            });
            wx.showToast({ title: '状态已更新', icon: 'none' });
        }
        catch (error) {
            console.warn('support case tracking failed:', error);
            wx.showToast({ title: '暂时无法查询', icon: 'none' });
        }
    },
});
