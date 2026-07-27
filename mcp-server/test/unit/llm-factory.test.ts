import { afterEach, describe, expect, it, vi } from 'vitest'

const anthropicConstructor = vi.fn()

vi.mock('../../src/llm/anthropic.js', () => ({
  AnthropicClient: class {
    readonly mode = 'live'

    constructor(key: string) {
      anthropicConstructor(key)
    }
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  anthropicConstructor.mockClear()
})

describe('LLM provider factory', () => {
  it('uses and caches the offline provider when the API key is absent', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { _resetLLMClientForTest, getLLMClient } = await import(
      '../../src/llm/factory.js'
    )

    _resetLLMClientForTest()
    const first = getLLMClient()
    const second = getLLMClient()

    expect(first.mode).toBe('mock')
    expect(second).toBe(first)
    expect(stderr).toHaveBeenCalledWith(
      'fushi-mcp: LLM provider = mock (set ANTHROPIC_API_KEY for live)\n'
    )
    expect(anthropicConstructor).not.toHaveBeenCalled()
  })

  it('treats a whitespace-only API key as absent', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '   ')
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { _resetLLMClientForTest, getLLMClient } = await import(
      '../../src/llm/factory.js'
    )

    _resetLLMClientForTest()
    expect(getLLMClient().mode).toBe('mock')
    expect(anthropicConstructor).not.toHaveBeenCalled()
  })

  it('selects the live provider only when a non-empty key exists', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { _resetLLMClientForTest, getLLMClient } = await import(
      '../../src/llm/factory.js'
    )

    _resetLLMClientForTest()
    expect(getLLMClient().mode).toBe('live')
    expect(anthropicConstructor).toHaveBeenCalledWith('test-key')
    expect(stderr).toHaveBeenCalledWith(
      'fushi-mcp: LLM provider = anthropic (live)\n'
    )
  })
})
