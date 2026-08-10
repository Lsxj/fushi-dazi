import type { OperatorSessionOutput, SupportOperator } from '@fushi/contracts'
import { randomUUID } from 'node:crypto'

const COOKIE_NAME = 'fushi_operator_session'
const SESSION_TTL_SECONDS = 8 * 60 * 60
const MAX_SESSIONS = 50

const operatorDirectory: Record<SupportOperator['id'], SupportOperator> = {
  'demo-support-agent': { id: 'demo-support-agent', role: 'support-agent' },
  'demo-safety-reviewer': { id: 'demo-safety-reviewer', role: 'safety-reviewer' },
}

type CloudBaseRole = SupportOperator['role']

interface CloudBaseUserInfo {
  sub?: string
  user_id?: string
  status?: string
}

export interface CloudBaseAuthOptions {
  authorization?: string
  envId: string
  operatorRoles: ReadonlyMap<string, CloudBaseRole>
  fetchUser?: (url: string, init: RequestInit) => Promise<Response>
}

interface StoredSession {
  token: string
  operator: SupportOperator
  expiresAt: string
}

const sessions = new Map<string, StoredSession>()

function output(session?: StoredSession): OperatorSessionOutput {
  return {
    authenticated: Boolean(session),
    ...(session
      ? {
          operator: structuredClone(session.operator),
          expiresAt: session.expiresAt,
        }
      : {}),
    identityMode: 'local-demo-session',
    sessionTransport: 'http-only-cookie',
  }
}

function purgeExpired(now = Date.now()): void {
  for (const [token, session] of sessions) {
    if (new Date(session.expiresAt).getTime() <= now) sessions.delete(token)
  }
}

function tokenFromCookie(cookieHeader?: string): string | undefined {
  return cookieHeader
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === COOKIE_NAME)?.[1]
}

export function createDemoOperatorSession(operatorId: SupportOperator['id']): {
  cookie: string
  output: OperatorSessionOutput
} {
  purgeExpired()
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  const session: StoredSession = {
    token,
    operator: structuredClone(operatorDirectory[operatorId]),
    expiresAt,
  }
  sessions.set(token, session)
  if (sessions.size > MAX_SESSIONS) {
    const oldestToken = sessions.keys().next().value
    if (oldestToken) sessions.delete(oldestToken)
  }
  return {
    cookie: `${COOKIE_NAME}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`,
    output: output(session),
  }
}

export function readOperatorSession(cookieHeader?: string): OperatorSessionOutput {
  purgeExpired()
  const token = tokenFromCookie(cookieHeader)
  return output(token ? sessions.get(token) : undefined)
}

export function revokeOperatorSession(cookieHeader?: string): {
  cookie: string
  output: OperatorSessionOutput
} {
  const token = tokenFromCookie(cookieHeader)
  if (token) sessions.delete(token)
  return {
    cookie: `${COOKIE_NAME}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0`,
    output: output(),
  }
}

export function clearOperatorSessionsForTests(): void {
  sessions.clear()
}

export function parseCloudBaseOperatorRoles(value?: string): Map<string, CloudBaseRole> {
  const roles = new Map<string, CloudBaseRole>()
  for (const entry of value?.split(',') ?? []) {
    const [uid, role, ...extra] = entry.split(':').map((part) => part.trim())
    if (
      extra.length === 0 &&
      uid &&
      (role === 'support-agent' || role === 'safety-reviewer')
    ) {
      roles.set(uid, role)
    }
  }
  return roles
}

function unauthenticatedCloudBaseSession(): OperatorSessionOutput {
  return {
    authenticated: false,
    identityMode: 'cloudbase-access-token',
    sessionTransport: 'bearer-access-token',
  }
}

export async function readCloudBaseOperatorSession(
  options: CloudBaseAuthOptions
): Promise<OperatorSessionOutput> {
  const match = options.authorization?.match(/^Bearer\s+([^\s]+)$/i)
  if (!match || !options.envId.trim() || options.operatorRoles.size === 0) {
    return unauthenticatedCloudBaseSession()
  }

  try {
    const fetchUser = options.fetchUser ?? fetch
    const response = await fetchUser(
      `https://${options.envId}.api.tcloudbasegateway.com/auth/v1/user/me`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${match[1]}` },
      }
    )
    if (!response.ok) return unauthenticatedCloudBaseSession()
    const user = (await response.json()) as CloudBaseUserInfo
    const uid = user.user_id ?? user.sub
    const role = uid ? options.operatorRoles.get(uid) : undefined
    if (!uid || !role || (user.status && user.status !== 'ACTIVE')) {
      return unauthenticatedCloudBaseSession()
    }
    return {
      authenticated: true,
      operator: { id: uid, role },
      identityMode: 'cloudbase-access-token',
      sessionTransport: 'bearer-access-token',
    }
  } catch {
    return unauthenticatedCloudBaseSession()
  }
}
