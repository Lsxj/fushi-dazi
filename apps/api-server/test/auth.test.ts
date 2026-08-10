import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearOperatorSessionsForTests,
  createDemoOperatorSession,
  parseCloudBaseOperatorRoles,
  readCloudBaseOperatorSession,
  readOperatorSession,
  revokeOperatorSession,
} from '../src/auth.js'

describe('local demo operator sessions', () => {
  beforeEach(() => clearOperatorSessionsForTests())

  it('fails closed for a missing or forged cookie', () => {
    expect(readOperatorSession()).toMatchObject({ authenticated: false })
    expect(readOperatorSession('fushi_operator_session=forged')).toMatchObject({
      authenticated: false,
    })
  })

  it('resolves the operator from an opaque HttpOnly cookie and revokes it', () => {
    const login = createDemoOperatorSession('demo-safety-reviewer')
    const cookieHeader = login.cookie.split(';')[0]

    expect(login.cookie).toContain('HttpOnly')
    expect(login.cookie).toContain('SameSite=Strict')
    expect(readOperatorSession(cookieHeader)).toMatchObject({
      authenticated: true,
      operator: { id: 'demo-safety-reviewer', role: 'safety-reviewer' },
      sessionTransport: 'http-only-cookie',
    })

    const logout = revokeOperatorSession(cookieHeader)
    expect(logout.cookie).toContain('Max-Age=0')
    expect(readOperatorSession(cookieHeader)).toMatchObject({ authenticated: false })
  })
})

describe('CloudBase operator access tokens', () => {
  const operatorRoles = new Map([['uid-safety-1', 'safety-reviewer' as const]])

  it('fails closed for missing, rejected, inactive, or non-allowlisted identities', async () => {
    expect(
      await readCloudBaseOperatorSession({
        envId: 'env-test',
        operatorRoles,
      })
    ).toMatchObject({ authenticated: false, identityMode: 'cloudbase-access-token' })

    const rejected = await readCloudBaseOperatorSession({
      authorization: 'Bearer rejected-token',
      envId: 'env-test',
      operatorRoles,
      fetchUser: async () => new Response(null, { status: 401 }),
    })
    const inactive = await readCloudBaseOperatorSession({
      authorization: 'Bearer inactive-token',
      envId: 'env-test',
      operatorRoles,
      fetchUser: async () => Response.json({ user_id: 'uid-safety-1', status: 'BLOCKED' }),
    })
    const unknown = await readCloudBaseOperatorSession({
      authorization: 'Bearer unknown-token',
      envId: 'env-test',
      operatorRoles,
      fetchUser: async () => Response.json({ user_id: 'uid-unknown', status: 'ACTIVE' }),
    })

    expect(rejected.authenticated).toBe(false)
    expect(inactive.authenticated).toBe(false)
    expect(unknown.authenticated).toBe(false)

    const missingEnvironment = await readCloudBaseOperatorSession({
      authorization: 'Bearer token',
      envId: '',
      operatorRoles,
    })
    const missingAllowlist = await readCloudBaseOperatorSession({
      authorization: 'Bearer token',
      envId: 'env-test',
      operatorRoles: new Map(),
    })
    const malformedAuthorization = await readCloudBaseOperatorSession({
      authorization: 'Basic token',
      envId: 'env-test',
      operatorRoles,
    })
    const unavailableIdentityService = await readCloudBaseOperatorSession({
      authorization: 'Bearer token',
      envId: 'env-test',
      operatorRoles,
      fetchUser: async () => {
        throw new Error('network unavailable')
      },
    })

    expect(missingEnvironment.authenticated).toBe(false)
    expect(missingAllowlist.authenticated).toBe(false)
    expect(malformedAuthorization.authenticated).toBe(false)
    expect(unavailableIdentityService.authenticated).toBe(false)
  })

  it('maps only a verified allowlisted uid to its server-side role', async () => {
    const session = await readCloudBaseOperatorSession({
      authorization: 'Bearer verified-token',
      envId: 'env-test',
      operatorRoles,
      fetchUser: async (url, init) => {
        expect(url).toBe('https://env-test.api.tcloudbasegateway.com/auth/v1/user/me')
        expect(init.headers).toEqual({ Authorization: 'Bearer verified-token' })
        return Response.json({ user_id: 'uid-safety-1', status: 'ACTIVE' })
      },
    })

    expect(session).toMatchObject({
      authenticated: true,
      operator: { id: 'uid-safety-1', role: 'safety-reviewer' },
      identityMode: 'cloudbase-access-token',
      sessionTransport: 'bearer-access-token',
    })

    const legacySubject = await readCloudBaseOperatorSession({
      authorization: 'Bearer verified-token',
      envId: 'env-test',
      operatorRoles,
      fetchUser: async () => Response.json({ sub: 'uid-safety-1' }),
    })
    expect(legacySubject.authenticated).toBe(true)
  })

  it('parses only valid uid-to-role allowlist entries', () => {
    expect(
      [...parseCloudBaseOperatorRoles(
        'uid-1:support-agent,bad,uid-2:safety-reviewer,uid-3:owner,uid-4:support-agent:extra'
      )]
    ).toEqual([
      ['uid-1', 'support-agent'],
      ['uid-2', 'safety-reviewer'],
    ])
  })
})
