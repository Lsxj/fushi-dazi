const environmentId = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim()
const sessionRestoreTimeoutMs = 3_000

interface CloudBaseSdk {
  init(config: cloudbase.ICloudbaseConfig): cloudbase.ICloudbase
}

type CloudBaseApp = cloudbase.ICloudbase

let appPromise: Promise<CloudBaseApp | undefined> | undefined

async function restoreWithin<T>(operation: Promise<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timeout = globalThis.setTimeout(
      () => resolve(undefined),
      sessionRestoreTimeoutMs
    )
    operation.then(
      (value) => {
        globalThis.clearTimeout(timeout)
        resolve(value)
      },
      () => {
        globalThis.clearTimeout(timeout)
        resolve(undefined)
      }
    )
  })
}

function getApp(): Promise<CloudBaseApp | undefined> {
  if (!appPromise) {
    appPromise = environmentId
      ? import('@cloudbase/js-sdk').then((imported: unknown) => {
          const sdk =
            (imported as { default?: CloudBaseSdk }).default ??
            (imported as CloudBaseSdk)
          return sdk.init({
            env: environmentId,
            region: 'ap-shanghai',
            persistence: 'local',
          })
        })
      : Promise.resolve(undefined)
  }
  return appPromise
}

async function requireAuth() {
  const app = await getApp()
  if (!app) throw new Error('CloudBase 管理员登录尚未配置')
  return app.auth()
}

export function isCloudBaseConsole(): boolean {
  return Boolean(environmentId && import.meta.env.VITE_API_BASE_URL?.trim())
}

function safeCloudBaseLoginError(error: unknown): Error {
  const providerText =
    error && typeof error === 'object'
      ? `${'code' in error ? String(error.code) : ''} ${
          'message' in error ? String(error.message) : ''
        }`.toLowerCase()
      : String(error ?? '').toLowerCase()

  if (/not.?enabled|disabled|未开启|未启用/.test(providerText)) {
    return new Error('当前 CloudBase 环境未启用邮箱或用户名密码登录')
  }
  if (/unverified|not.?verified|未验证|未激活/.test(providerText)) {
    return new Error('邮箱尚未完成验证，请先通过验证邮件激活')
  }
  if (/network|timeout|fetch|unavailable|网络|超时/.test(providerText)) {
    return new Error('CloudBase 认证服务暂时不可用，请稍后重试')
  }
  if (
    /invalid|credential|password|not.?found|user.?not|账号|密码|用户不存在/.test(
      providerText
    )
  ) {
    return new Error('账号或密码无效，请确认使用的是 CloudBase 应用用户凭据')
  }
  return new Error('CloudBase 身份验证失败，请检查登录方式和账号配置')
}

export async function getCloudBaseAccessToken(): Promise<string | undefined> {
  const app = await restoreWithin(getApp())
  if (!app) return undefined
  const auth = app.auth()
  const user = await restoreWithin(auth.getCurrentUser())
  if (!user) return undefined
  const token = await restoreWithin(auth.getAccessToken())
  if (
    !token ||
    typeof token !== 'object' ||
    !('accessToken' in token) ||
    typeof token.accessToken !== 'string'
  ) {
    return undefined
  }
  return token.accessToken || undefined
}

export async function signInCloudBaseOperator(
  identifier: string,
  password: string
): Promise<void> {
  const normalizedIdentifier = identifier.trim()
  if (!normalizedIdentifier || !password) {
    throw new Error('请输入管理员账号和密码')
  }
  const auth = await requireAuth()
  const credentials = normalizedIdentifier.includes('@')
    ? { email: normalizedIdentifier, password }
    : { username: normalizedIdentifier, password }
  let result: Awaited<ReturnType<typeof auth.signInWithPassword>>
  try {
    result = await auth.signInWithPassword(credentials)
  } catch (error) {
    throw safeCloudBaseLoginError(error)
  }
  if (result.error) throw safeCloudBaseLoginError(result.error)
  const token = await auth.getAccessToken()
  if (!token.accessToken) {
    throw new Error('CloudBase 登录已通过，但未返回有效访问令牌')
  }
}

export async function signOutCloudBaseOperator(): Promise<void> {
  const app = await getApp()
  if (!app) return
  await app.auth().signOut()
}
