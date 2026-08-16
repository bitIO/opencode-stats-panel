const UNITS = [
  { value: 1e12, suffix: "T" },
  { value: 1e9, suffix: "B" },
  { value: 1e6, suffix: "M" },
  { value: 1e3, suffix: "K" },
]

export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "—"
  const abs = Math.abs(n)
  if (abs < 1000) return String(Math.round(n))
  for (const u of UNITS) {
    if (abs >= u.value) {
      const v = n / u.value
      return `${v >= 100 ? Math.round(v) : v.toFixed(1)}${u.suffix}`
    }
  }
  return String(Math.round(n))
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

export function fmtCost(n: number): string {
  if (n <= 0) return "$0"
  return `$${n >= 1 ? n.toFixed(2) : n.toFixed(3)}`
}

export function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`
}

export function fmtChars(n: number): string {
  return `${fmtCompact(n)} chars`
}

export function fmtEpoch(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function fmtRelative(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return fmtEpoch(ms)
}

const MODEL_PREFIXES = [
  "deepseek-v4-",
  "anthropic.claude-",
  "opencode/",
  "gpt-5-",
  "gemini-3.1-",
  "gemini-3-",
]

export function modelLabel(raw: string): { label: string; variant?: string; provider?: string } {
  try {
    const parsed = JSON.parse(raw) as { id?: string; providerID?: string; variant?: string }
    const id = parsed.id ?? raw
    let label = id
    for (const p of MODEL_PREFIXES) {
      if (label.startsWith(p)) {
        label = label.slice(p.length)
        break
      }
    }
    return {
      label,
      variant: parsed.variant && parsed.variant !== "default" ? parsed.variant : undefined,
      provider: parsed.providerID,
    }
  } catch {
    return { label: raw }
  }
}

export function tokensFromChars(chars: number): number {
  return Math.round(chars / 4)
}
