// Small, dependency-free unique id. Good enough for local-first records.
export function uid(prefix = ''): string {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 8)
  return `${prefix}${t}${r}`
}
