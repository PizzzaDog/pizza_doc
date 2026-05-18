export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      const del = (prev[j] ?? 0) + 1
      const ins = (curr[j - 1] ?? 0) + 1
      const sub = (prev[j - 1] ?? 0) + cost
      curr[j] = Math.min(del, ins, sub)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0
  }
  return prev[b.length] ?? 0
}

export function closestMatches(needle: string, haystack: Iterable<string>, limit = 3): string[] {
  const scored: Array<{ value: string; distance: number }> = []
  for (const value of haystack) {
    if (value === needle) continue
    scored.push({ value, distance: levenshtein(needle, value) })
  }
  scored.sort((a, b) => a.distance - b.distance || a.value.localeCompare(b.value))
  const maxDistance = Math.max(2, Math.floor(needle.length / 3))
  return scored
    .filter((s) => s.distance <= maxDistance)
    .slice(0, limit)
    .map((s) => s.value)
}
