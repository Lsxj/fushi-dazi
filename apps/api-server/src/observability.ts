import type {
  ListSafetyTracesOutput,
  SafetyTrace,
} from '@fushi/contracts'

const MAX_TRACES = 100
const traces: SafetyTrace[] = []

export function recordSafetyTrace(trace: SafetyTrace): void {
  traces.unshift(trace)
  if (traces.length > MAX_TRACES) {
    traces.length = MAX_TRACES
  }
}

export function listSafetyTraces(): ListSafetyTracesOutput {
  const allowed = traces.filter((trace) => trace.status === 'allowed').length
  const blocked = traces.length - allowed
  const totalDuration = traces.reduce(
    (sum, trace) => sum + trace.durationMs,
    0
  )

  return {
    traces: [...traces],
    summary: {
      total: traces.length,
      allowed,
      blocked,
      averageDurationMs:
        traces.length === 0
          ? 0
          : Number((totalDuration / traces.length).toFixed(2)),
    },
    privacyMode: 'summary-only',
  }
}

export function clearSafetyTraces(): void {
  traces.length = 0
}
