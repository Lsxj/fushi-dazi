const environmentId = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim()

interface CloudBaseSdk {
  init(config: cloudbase.ICloudbaseConfig): cloudbase.ICloudbase
}

type CloudBaseApp = cloudbase.ICloudbase

let appPromise: Promise<CloudBaseApp | undefined> | undefined

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

export async function getCloudBaseAccessToken(): Promise<string | undefined> {
  const app = await getApp()
  if (!app) return undefined
  const auth = app.auth()
  const user = await auth.getCurrentUser()
  if (!user) return undefined
  const token = await auth.getAccessToken()
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
  const result = await auth.signInWithPassword(credentials)
  if (result.error) throw new Error(result.error.message || 'CloudBase 登录失败')
  const token = await auth.getAccessToken()
  if (!token.accessToken) throw new Error('CloudBase 未返回访问令牌')
}

export async function signOutCloudBaseOperator(): Promise<void> {
  const app = await getApp()
  if (!app) return
  await app.auth().signOut()
}
