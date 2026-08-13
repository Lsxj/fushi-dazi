import type { OperatorSessionOutput } from '@fushi/contracts'

const environmentId = import.meta.env.VITE_CLOUDBASE_ENV_ID?.trim()
const sessionRestoreTimeoutMs = 3_000

interface CloudBaseAuth {
  getAccessToken(): Promise<{ accessToken?: string }>
  getCurrentUser(): Promise<unknown>
  signIn(credentials: { username: string; password: string }): Promise<unknown>
  signOut(): Promise<unknown>
}

interface CloudBaseApp {
  auth(): CloudBaseAuth
}

interface CloudBaseSdk {
  init(config: {
    env: string
    region: 'ap-shanghai'
    persistence: 'local'
  }): CloudBaseApp
}

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
  if (!app) throw new Error('CloudBase administrator sign-in is not configured')
  return app.auth()
}

export function isCloudBaseConsole(): boolean {
  return Boolean(environmentId && import.meta.env.VITE_API_BASE_URL?.trim())
}

const unauthenticatedCloudBaseSession: OperatorSessionOutput = {
  authenticated: false,
  identityMode: 'cloudbase-access-token',
  sessionTransport: 'bearer-access-token',
}

export type RestoredCloudBaseOperatorSession = OperatorSessionOutput & {
  recoveryNotice?: string
}

function safeCloudBaseLoginError(error: unknown): Error {
  const providerText =
    error && typeof error === 'object'
      ? `${'code' in error ? String(error.code) : ''} ${
          'message' in error ? String(error.message) : ''
        }`.toLowerCase()
      : String(error ?? '').toLowerCase()

  if (/not.?enabled|disabled|未开启|未启用/.test(providerText)) {
    return new Error('Email or username/password sign-in is not enabled for this CloudBase environment')
  }
  if (/unverified|not.?verified|未验证|未激活/.test(providerText)) {
    return new Error('This email address has not been verified. Use the verification email to activate it first')
  }
  if (/network|timeout|fetch|unavailable|网络|超时/.test(providerText)) {
    return new Error('CloudBase authentication is temporarily unavailable. Try again later')
  }
  if (
    /invalid|credential|password|not.?found|user.?not|账号|密码|用户不存在/.test(
      providerText
    )
  ) {
    return new Error('Invalid credentials. Use a valid CloudBase application account')
  }
  return new Error('CloudBase authentication failed. Check the sign-in method and account configuration')
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

export async function restoreCloudBaseOperatorSession(
  readServerSession: () => Promise<OperatorSessionOutput>
): Promise<RestoredCloudBaseOperatorSession> {
  if (!(await getCloudBaseAccessToken())) {
    return unauthenticatedCloudBaseSession
  }

  try {
    return await readServerSession()
  } catch {
    try {
      await signOutCloudBaseOperator()
    } catch {
      // The server session still fails closed even if local cleanup is unavailable.
    }
    return {
      ...unauthenticatedCloudBaseSession,
      recoveryNotice: 'Your previous administrator session has expired. Sign in again.',
    }
  }
}

export async function signInCloudBaseOperator(
  identifier: string,
  password: string
): Promise<void> {
  const normalizedIdentifier = identifier.trim()
  if (!normalizedIdentifier || !password) {
    throw new Error('Enter your administrator account and password')
  }
  const auth = await requireAuth()
  try {
    await auth.signIn({ username: normalizedIdentifier, password })
  } catch (error) {
    throw safeCloudBaseLoginError(error)
  }
  const token = await auth.getAccessToken()
  if (!token.accessToken) {
    throw new Error('CloudBase sign-in succeeded but did not return a valid access token')
  }
}

export async function signOutCloudBaseOperator(): Promise<void> {
  const app = await getApp()
  if (!app) return
  await app.auth().signOut()
}
