import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cloudbaseMocks = vi.hoisted(() => {
  const auth = {
    getAccessToken: vi.fn(),
    getCurrentUser: vi.fn(),
    signInWithPassword: vi.fn(),
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
    cloudbaseMocks.auth.signInWithPassword.mockReset()
    cloudbaseMocks.auth.signOut.mockReset()
    cloudbaseMocks.init.mockClear()
  })

  afterEach(() => vi.unstubAllEnvs())

  it('fails closed when the production environment is not configured', async () => {
    const cloudbase = await loadCloudBase(false)

    expect(cloudbase.isCloudBaseConsole()).toBe(false)
    await expect(cloudbase.getCloudBaseAccessToken()).resolves.toBeUndefined()
    await expect(
      cloudbase.signInCloudBaseOperator('operator@example.com', 'secret')
    ).rejects.toThrow('CloudBase 管理员登录尚未配置')
    await expect(cloudbase.signOutCloudBaseOperator()).resolves.toBeUndefined()
  })

  it('rejects incomplete credentials before loading the identity provider', async () => {
    const cloudbase = await loadCloudBase(true)

    await expect(cloudbase.signInCloudBaseOperator('', '')).rejects.toThrow(
      '请输入管理员账号和密码'
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

  it('returns the current user access token for oRPC requests', async () => {
    cloudbaseMocks.auth.getCurrentUser.mockResolvedValue({ uid: 'operator-1' })
    cloudbaseMocks.auth.getAccessToken.mockResolvedValue({
      accessToken: 'access-token',
      env: 'env-test',
    })
    const cloudbase = await loadCloudBase(true)

    await expect(cloudbase.getCloudBaseAccessToken()).resolves.toBe('access-token')
  })

  it('supports both email and username password identities', async () => {
    cloudbaseMocks.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'operator-1' } },
      error: null,
    })
    cloudbaseMocks.auth.getAccessToken.mockResolvedValue({
      accessToken: 'access-token',
      env: 'env-test',
    })
    const cloudbase = await loadCloudBase(true)

    await cloudbase.signInCloudBaseOperator('operator@example.com', 'secret')
    await cloudbase.signInCloudBaseOperator('administrator', 'secret')

    expect(cloudbaseMocks.auth.signInWithPassword).toHaveBeenNthCalledWith(1, {
      email: 'operator@example.com',
      password: 'secret',
    })
    expect(cloudbaseMocks.auth.signInWithPassword).toHaveBeenNthCalledWith(2, {
      username: 'administrator',
      password: 'secret',
    })
  })

  it('surfaces identity rejection and missing-token failures', async () => {
    const cloudbase = await loadCloudBase(true)
    cloudbaseMocks.auth.signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { message: 'invalid credentials' },
    })

    await expect(
      cloudbase.signInCloudBaseOperator('administrator', 'wrong')
    ).rejects.toThrow('invalid credentials')

    cloudbaseMocks.auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'operator-1' } },
      error: null,
    })
    cloudbaseMocks.auth.getAccessToken.mockResolvedValueOnce({
      accessToken: '',
      env: 'env-test',
    })
    await expect(
      cloudbase.signInCloudBaseOperator('administrator', 'secret')
    ).rejects.toThrow('CloudBase 未返回访问令牌')
  })

  it('revokes the CloudBase session on logout', async () => {
    cloudbaseMocks.auth.signOut.mockResolvedValue(undefined)
    const cloudbase = await loadCloudBase(true)

    await cloudbase.signOutCloudBaseOperator()
    expect(cloudbaseMocks.auth.signOut).toHaveBeenCalledOnce()
  })
})
