export function fmtCompact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'K'
  return String(n)
}
export const fmtInt = (n: number) => n.toLocaleString('en-US')
/**
 * A calendar day (yyyy-mm-dd) as midnight in the viewer's own time zone. `new Date('2026-12-01')` would read it as
 * UTC and show the previous day to anyone west of Greenwich, which is every US viewer.
 */
export function localDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Formats a timestamp, or a calendar day without shifting it across time zones. */
export function fmtDate(iso: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? localDay(iso) : new Date(iso)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
