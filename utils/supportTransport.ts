export const SUPPORT_FUNCTION_NAME = 'support-api'

interface SupportHttpResponse<T> {
  statusCode: number
  data: T | string
}

interface SupportCloudApi {
  callHTTPFunction<T>(options: {
    name: string
    path: string
    method: 'POST'
    data: Record<string, unknown>
  }): Promise<SupportHttpResponse<T>>
}

export function parseSupportResponse<T>(data: T | string): T {
  if (typeof data !== 'string') return data
  return JSON.parse(data) as T
}

export async function callSupportApi<T>(
  path: '/api/v1/support/cases' | '/api/v1/support/cases/track',
  data: Record<string, unknown>
): Promise<{ statusCode: number; data: T }> {
  const cloud = wx.cloud as SupportCloudApi | undefined
  if (!cloud?.callHTTPFunction) {
    throw new Error('cloud_http_function_unavailable')
  }

  const response = await cloud.callHTTPFunction<T>({
    name: SUPPORT_FUNCTION_NAME,
    path,
    method: 'POST',
    data,
  })

  return {
    statusCode: response.statusCode,
    data: parseSupportResponse(response.data),
  }
}
