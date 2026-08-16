import type { BreakdownRow } from "@/lib/api"
import { fmtCompact, fmtCost, fmtPct } from "@/lib/format"
import { cn } from "@/lib/utils"

interface BreakdownBarsProps {
  rows: BreakdownRow[]
  valueKey: "cost" | "tokensInput"
  showCache?: boolean
  showSessions?: boolean
}

export function BreakdownBars({ rows, valueKey, showCache = false, showSessions = false }: BreakdownBarsProps) {
  const max = Math.max(...rows.map((r) => r[valueKey]), 1)
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const pct = (r[valueKey] / max) * 100
        return (
          <div key={r.key} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-xs">{r.key}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {valueKey === "cost" ? fmtCost(r.cost) : fmtCompact(r.tokensInput)}
                {showSessions && <span className="ml-1.5 text-[10px] text-muted-foreground/60">· {r.sessions} sess</span>}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  valueKey === "cost"
                    ? "bg-gradient-to-r from-chart-2 to-chart-3"
                    : "bg-gradient-to-r from-chart-1 to-chart-5",
                )}
                style={{ width: `${Math.max(pct, 1.5)}%` }}
              />
            </div>
            {showCache && (
              <div className="mt-0.5 text-right font-mono text-[10px] text-muted-foreground/70">
                cache {fmtPct(r.cacheHitRate)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
