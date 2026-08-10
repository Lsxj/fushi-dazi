"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORT_FUNCTION_NAME = void 0;
exports.parseSupportResponse = parseSupportResponse;
exports.callSupportApi = callSupportApi;
exports.SUPPORT_FUNCTION_NAME = 'support-api';
function parseSupportResponse(data) {
    if (typeof data !== 'string')
        return data;
    return JSON.parse(data);
}
async function callSupportApi(path, data) {
    const cloud = wx.cloud;
    if (!cloud?.callHTTPFunction) {
        throw new Error('cloud_http_function_unavailable');
    }
    const response = await cloud.callHTTPFunction({
        name: exports.SUPPORT_FUNCTION_NAME,
        path,
        method: 'POST',
        data,
    });
    return {
        statusCode: response.statusCode,
        data: parseSupportResponse(response.data),
    };
}
