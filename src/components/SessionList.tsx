import type { WasteSession } from "@/lib/api"
import { fmtCompact, fmtCost, fmtPct, fmtRelative } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface SessionListProps {
  sessions: WasteSession[]
  onSelect: (id: string) => void
  valueKey: "cost" | "tokensInput"
}

export function SessionList({ sessions, onSelect, valueKey }: SessionListProps) {
  const max = Math.max(...sessions.map((s) => s[valueKey]), 1)
  return (
    <div className="space-y-1">
      {sessions.map((s) => {
        const pct = (s[valueKey] / max) * 100
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary/50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs">{s.title || "(untitled)"}</span>
                {s.toolCalls === 0 && s.messages > 1 && (
                  <Badge variant="outline" className="shrink-0 bg-red-500/10 px-1 text-[9px] text-red-400">
                    0 tools
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                <span className="truncate">{s.project}</span>
                <span>·</span>
                <span>{s.agent}</span>
                <span>·</span>
                <span>{fmtRelative(s.timeCreated)}</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full",
                    valueKey === "cost" ? "bg-chart-3" : "bg-chart-1",
                  )}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 text-right font-mono text-[11px] tabular-nums">
              <div className="font-medium">{valueKey === "cost" ? fmtCost(s.cost) : fmtCompact(s.tokensInput)}</div>
              <div className="text-[10px] text-muted-foreground">
                {fmtCompact(s.tokensInput)} in · {fmtPct(s.cacheHitRate, 0)} cache
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
