import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cloudbaseMocks = vi.hoisted(() => {
  const auth = {
    getAccessToken: vi.fn(),
    getCurrentUser: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }
  return {
    auth,
    init: vi.fn(() => ({ auth: () => auth })),
  }
})

vi.mock('@cloudbase/js-sdk', () => ({
  default: { init: cloudbaseMocks.init },
}))

async function loadCloudBase(configured: boolean) {
  vi.resetModules()
  if (configured) {
    vi.stubEnv('VITE_CLOUDBASE_ENV_ID', 'env-test')
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api')
  } else {
    vi.stubEnv('VITE_CLOUDBASE_ENV_ID', '')
    vi.stubEnv('VITE_API_BASE_URL', '')
  }
  return import('./cloudbase')
}

describe('CloudBase browser authentication boundary', () => {
  beforeEach(() => {
    cloudbaseMocks.auth.getAccessToken.mockReset()
    cloudbaseMocks.auth.getCurrentUser.mockReset()
    cloudbaseMocks.auth.signIn.mockReset()
    cloudbaseMocks.auth.signOut.mockReset()
    cloudbaseMocks.init.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('fails closed when the production environment is not configured', async () => {
    const cloudbase = await loadCloudBase(false)

    expect(cloudbase.isCloudBaseConsole()).toBe(false)
    await expect(cloudbase.getCloudBaseAccessToken()).resolves.toBeUndefined()
    await expect(
      cloudbase.signInCloudBaseOperator('operator@example.com', 'secret')
    ).rejects.toThrow('CloudBase administrator sign-in is not configured')
    await expect(cloudbase.signOutCloudBaseOperator()).resolves.toBeUndefined()
  })

  it('rejects incomplete credentials before loading the identity provider', async () => {
    const cloudbase = await loadCloudBase(true)

    await expect(cloudbase.signInCloudBaseOperator('', '')).rejects.toThrow(
      'Enter your administrator account and password'
    )
    expect(cloudbaseMocks.init).not.toHaveBeenCalled()
  })

  it('returns no bearer token when there is no current CloudBase user', async () => {
    cloudbaseMocks.auth.getCurrentUser.mockResolvedValue(null)
    const cloudbase = await loadCloudBase(true)

    expect(cloudbase.isCloudBaseConsole()).toBe(true)
    await expect(cloudbase.getCloudBaseAccessToken()).resolves.toBeUndefined()
    expect(cloudbaseMocks.auth.getAccessToken).not.toHaveBeenCalled()
  })

  it('fails closed when restoring the previous CloudBase session rejects', async () => {
    cloudbaseMocks.auth.getCurrentUser.mockRejectedValue(
      new Error('identity service unavailable')
    )
    const cloudbase = await loadCloudBase(true)

    await expect(cloudbase.getCloudBaseAccessToken()).resolves.toBeUndefined()
    expect(cloudbaseMocks.auth.getAccessToken).not.toHaveBeenCalled()
  })

  it('shows the login boundary when previous-session restoration times out', async () => {
    vi.useFakeTimers()
    cloudbaseMocks.auth.getCurrentUser.mockReturnValue(new Promise(() => {}))
    const cloudbase = await loadCloudBase(true)

    const token = cloudbase.getCloudBaseAccessToken()
    await vi.advanceTimersByTimeAsync(3_000)

    await expect(token).resolves.toBeUndefined()
    expect(cloudbaseMocks.auth.getAccessToken).not.toHaveBeenCalled()
  })

  it('returns the current user access token for oRPC requests', async () => {
    cloudbaseMocks.auth.getCurrentUser.mockResolvedValue({ uid: 'operator-1' })
    cloudbaseMocks.auth.getAccessToken.mockResolvedValue({
      accessToken: 'access-token',
      env: 'env-test',
    })
    const cloudbase = await loadCloudBase(true)

    await expect(cloudbase.getCloudBaseAccessToken()).resolves.toBe('access-token')
  })

  it('clears an invalid restored session and returns to the login boundary', async () => {
    cloudbaseMocks.auth.getCurrentUser.mockResolvedValue({ uid: 'operator-1' })
    cloudbaseMocks.auth.getAccessToken.mockResolvedValue({
      accessToken: 'expired-access-token',
      env: 'env-test',
    })
    cloudbaseMocks.auth.signOut.mockResolvedValue(undefined)
    const cloudbase = await loadCloudBase(true)

    const session = await cloudbase.restoreCloudBaseOperatorSession(() =>
      Promise.reject(new Error('MISSING_CREDENTIALS'))
    )

    expect(session).toEqual({
      authenticated: false,
      identityMode: 'cloudbase-access-token',
      sessionTransport: 'bearer-access-token',
      recoveryNotice: 'Your previous administrator session has expired. Sign in again.',
    })
    expect(cloudbaseMocks.auth.signOut).toHaveBeenCalledOnce()
  })

  it('supports both email and username password identities', async () => {
    cloudbaseMocks.auth.signIn.mockResolvedValue({ user: { id: 'operator-1' } })
    cloudbaseMocks.auth.getAccessToken.mockResolvedValue({
      accessToken: 'access-token',
      env: 'env-test',
    })
    const cloudbase = await loadCloudBase(true)

    await cloudbase.signInCloudBaseOperator('operator@example.com', 'secret')
    await cloudbase.signInCloudBaseOperator('administrator', 'secret')

    expect(cloudbaseMocks.auth.signIn).toHaveBeenNthCalledWith(1, {
      username: 'operator@example.com',
      password: 'secret',
    })
    expect(cloudbaseMocks.auth.signIn).toHaveBeenNthCalledWith(2, {
      username: 'administrator',
      password: 'secret',
    })
  })

  it('maps provider failures to safe operator-facing diagnostics', async () => {
    const cloudbase = await loadCloudBase(true)
    cloudbaseMocks.auth.signIn.mockRejectedValueOnce({
      code: 'INVALID_CREDENTIALS',
      message: 'user not found',
    })

    await expect(
      cloudbase.signInCloudBaseOperator('administrator', 'wrong')
    ).rejects.toThrow('Invalid credentials')

    cloudbaseMocks.auth.signIn.mockRejectedValueOnce({
      code: 'PROVIDER_NOT_ENABLED',
      message: 'password sign-in disabled',
    })
    await expect(
      cloudbase.signInCloudBaseOperator('administrator', 'secret')
    ).rejects.toThrow('Email or username/password sign-in is not enabled')

    cloudbaseMocks.auth.signIn.mockRejectedValueOnce({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'email unverified',
    })
    await expect(
      cloudbase.signInCloudBaseOperator('operator@example.com', 'secret')
    ).rejects.toThrow('email address has not been verified')
  })

  it('reports a distinct failure when authentication returns no token', async () => {
    const cloudbase = await loadCloudBase(true)

    cloudbaseMocks.auth.signIn.mockResolvedValueOnce({ user: { id: 'operator-1' } })
    cloudbaseMocks.auth.getAccessToken.mockResolvedValueOnce({
      accessToken: '',
      env: 'env-test',
    })
    await expect(
      cloudbase.signInCloudBaseOperator('administrator', 'secret')
    ).rejects.toThrow('sign-in succeeded but did not return a valid access token')
  })

  it('revokes the CloudBase session on logout', async () => {
    cloudbaseMocks.auth.signOut.mockResolvedValue(undefined)
    const cloudbase = await loadCloudBase(true)

    await cloudbase.signOutCloudBaseOperator()
    expect(cloudbaseMocks.auth.signOut).toHaveBeenCalledOnce()
  })
})
