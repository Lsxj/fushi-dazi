/**
 * 日期工具 — 解决 `new Date('YYYY-MM-DD')` 走 UTC 在 +8 区导致跨日漂移的全家桶 bug。
 *
 * 经典坑:
 *   new Date('2026-05-14').getTime() === UTC 2026-05-14 00:00:00 === 本地 2026-05-14 08:00
 *   today = new Date(yyyy, mm, dd) === 本地零点
 *   diff = today - new Date('yesterday-str') = 16h, floor(/86400000) = 0 → 误算"今日"
 *
 * 所有 YYYY-MM-DD 字符串到时间戳的转换都应走 parseLocalDateMs;
 * 所有"取今日字符串"应走 todayLocalStr (避免 new Date().toISOString().slice(0,10) 凌晨段落到昨天)。
 */

// "YYYY-MM-DD" 或 ISO "YYYY-MM-DDTHH:mm:ss.sssZ" → 本地零点时间戳
// 截取前 10 字符兼容旧 ISO 数据 (如 statusSince 原本存 toISOString())
export function parseLocalDateMs(dateStr: string): number {
  if (!dateStr) return NaN
  const dateOnly = dateStr.slice(0, 10)
  const parts = dateOnly.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) {
    return new Date(dateStr).getTime()
  }
  return new Date(parts[0], parts[1] - 1, parts[2]).getTime()
}

// 取今日的 "YYYY-MM-DD" 字符串 (本地时区)
export function todayLocalStr(): string {
  const d = new Date()
  return formatLocalDate(d)
}

// Date → "YYYY-MM-DD" (本地)
export function formatLocalDate(d: Date): string {
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// 本地"今天零点"的 ms
export function todayLocalStartMs(): number {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// 两个 "YYYY-MM-DD" 之间的天数差 (b - a), 用本地零点算
export function daysBetweenDates(a: string, b: string): number {
  const aMs = parseLocalDateMs(a)
  const bMs = parseLocalDateMs(b)
  if (isNaN(aMs) || isNaN(bMs)) return 0
  return Math.round((bMs - aMs) / 86400000)
}

// "YYYY-MM-DD" 距今多少天 (今天=0, 昨天=1)
export function daysSinceDateStr(dateStr: string): number {
  const ms = parseLocalDateMs(dateStr)
  if (isNaN(ms)) return 0
  return Math.max(0, Math.floor((todayLocalStartMs() - ms) / 86400000))
}
