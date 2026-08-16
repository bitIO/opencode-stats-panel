import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

interface KpiCardProps {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  tone?: "default" | "good" | "warn" | "bad"
}

export function KpiCard({ label, value, hint, icon: Icon, tone = "default" }: KpiCardProps) {
  const dot = {
    default: "text-muted-foreground",
    good: "text-emerald-400",
    warn: "text-amber-400",
    bad: "text-red-400",
  }[tone]

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={cn("flex size-6 items-center justify-center rounded bg-secondary", dot)}>
            <Icon className="size-3.5" />
          </span>
        </div>
        <div className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}
