/**
 * Shared tool result helpers.
 *
 * Every tool handler in this server follows the same shape: try the work,
 * stringify the result into a text content block, and on error return an
 * isError=true result with the message. Repeating that boilerplate five-plus
 * times invites drift (one tool forgets isError, another uses a different
 * content shape) — so we centralize it here.
 */
export function toolTextResult(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  }
}

export function toolErrorResult(message: string, prefix?: string) {
  const text = prefix ? `${prefix}: ${message}` : message
  return {
    isError: true,
    content: [{ type: 'text' as const, text }],
  }
}

/**
 * Wrap a tool handler. Errors become isError MCP results; success becomes
 * a JSON-stringified text content block. The optional `errorPrefix` is
 * prepended to error messages so the LLM can tell which tool failed.
 */
export async function safeToolCall<T>(
  fn: () => T | Promise<T>,
  errorPrefix?: string
): Promise<ReturnType<typeof toolTextResult> | ReturnType<typeof toolErrorResult>> {
  try {
    const data = await fn()
    return toolTextResult(data)
  } catch (err) {
    return toolErrorResult((err as Error).message, errorPrefix)
  }
}
