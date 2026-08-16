import { AlertTriangle, Brain, Check, FileText, Terminal, Wrench, X } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CompositionBar, CATEGORY_META } from "@/components/CompositionBar"
import { useApi } from "@/hooks/use-api"
import { api, COMPOSITION_CATEGORIES } from "@/lib/api"
import { fmtCompact, fmtCost, fmtEpoch, modelLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

const PART_ICON: Record<string, { icon: typeof Wrench; color: string; label: string }> = {
  text: { icon: FileText, color: "text-sky-400", label: "text" },
  reasoning: { icon: Brain, color: "text-violet-400", label: "reasoning" },
  tool: { icon: Wrench, color: "text-amber-400", label: "tool" },
  "step-start": { icon: Terminal, color: "text-muted-foreground", label: "step" },
  "step-finish": { icon: Check, color: "text-muted-foreground", label: "step" },
  patch: { icon: FileText, color: "text-emerald-400", label: "patch" },
}

interface SessionDrawerProps {
  sessionId: string | null
  onClose: () => void
}

export function SessionDrawer({ sessionId, onClose }: SessionDrawerProps) {
  const { data, loading } = useApi(
    () => (sessionId ? api.sessionDetail(sessionId) : Promise.reject(new Error("closed"))),
    [sessionId],
  )

  return (
    <Sheet open={sessionId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[520px] overflow-y-auto sm:max-w-[520px]">
        {loading || !data ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <SheetHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <SheetTitle className="pr-6 text-base leading-snug">{data.title}</SheetTitle>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {data.agent}
                    </Badge>
                    <ModelBadge raw={data.model} />
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {data.directory}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </SheetHeader>

            <TokenBreakdown tokens={data.tokens} cost={data.cost} />

            <div className="rounded-md border p-3">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="font-mono text-[11px] text-muted-foreground">
                  context composition · estimated
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  scaffold {fmtCompact(data.scaffoldEstTokens)} tok
                </span>
              </div>
              <CompositionBar categories={data.composition} total={data.contentEstTokens + data.scaffoldEstTokens} />
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {COMPOSITION_CATEGORIES.filter((c) => data.composition[c] > 0)
                  .sort((a, b) => data.composition[b] - data.composition[a])
                  .slice(0, 5)
                  .map((c) => (
                    <span key={c} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <i className={cn("size-1.5 rounded-full", CATEGORY_META[c].className)} />
                      {CATEGORY_META[c].label} {fmtCompact(data.composition[c])}
                    </span>
                  ))}
              </div>
            </div>

            <div>
              <div className="mb-2 font-mono text-[11px] text-muted-foreground">
                timeline — {data.messages.length} messages
              </div>
              <div className="space-y-1.5">
                {data.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-md border px-3 py-2",
                      m.role === "user" ? "border-primary/20 bg-primary/5" : "border-border bg-secondary/40",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {m.role}
                      </span>
                      <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground/60">
                        <b className="tabular-nums text-foreground/80">≈{fmtCompact(m.estTokens)} tok</b>
                        {fmtEpoch(m.timeCreated)}
                      </span>
                    </div>
                    {m.estTokens > 0 && (
                      <div className="mt-1.5">
                        <CompositionBar categories={m.categories} total={m.estTokens} height="h-1.5" />
                      </div>
                    )}
                    {m.parts.length === 0 ? (
                      <div className="mt-1 text-xs text-muted-foreground/70">no parts</div>
                    ) : (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.parts.slice(0, 12).map((p, i) => {
                          const spec = PART_ICON[p.type] ?? { icon: Terminal, color: "text-muted-foreground", label: p.type }
                          const Icon = spec.icon
                          return (
                            <span
                              key={i}
                              title={p.tool ?? spec.label}
                              className={cn(
                                "flex items-center gap-1 rounded bg-background px-1.5 py-0.5 font-mono text-[10px]",
                                spec.color,
                              )}
                            >
                              <Icon className="size-3" />
                              {p.tool ?? spec.label}
                              {p.type === "tool" && p.outputChars > 1000 && (
                                <span className="text-amber-500">·{fmtCompact(p.outputChars)}c</span>
                              )}
                              {p.state === "error" && <AlertTriangle className="size-3 text-red-400" />}
                            </span>
                          )
                        })}
                        {m.parts.length > 12 && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            +{m.parts.length - 12} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function ModelBadge({ raw }: { raw: string }) {
  const { label, variant } = modelLabel(raw)
  return (
    <Badge variant="outline" className="font-mono text-[10px]">
      {label}
      {variant && <span className="ml-1 text-amber-400">{variant}</span>}
    </Badge>
  )
}

export function TokenBreakdown({
  tokens,
  cost,
  compact = false,
}: {
  tokens: { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }
  cost?: number
  compact?: boolean
}) {
  const total = tokens.input + tokens.output + tokens.reasoning
  const seg = (v: number) => (total > 0 ? (v / total) * 100 : 0)

  return (
    <div className={cn("rounded-md border p-3", !compact && "border-border")}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="bg-sky-400" style={{ width: `${seg(tokens.input)}%` }} />
        <div className="bg-violet-400" style={{ width: `${seg(tokens.reasoning)}%` }} />
        <div className="bg-emerald-400" style={{ width: `${seg(tokens.output)}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <i className="size-2 rounded-sm bg-sky-400" /> input <b className="ml-auto tabular-nums text-foreground">{fmtCompact(tokens.input)}</b>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <i className="size-2 rounded-sm bg-violet-400" /> reasoning <b className="ml-auto tabular-nums text-foreground">{fmtCompact(tokens.reasoning)}</b>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <i className="size-2 rounded-sm bg-emerald-400" /> output <b className="ml-auto tabular-nums text-foreground">{fmtCompact(tokens.output)}</b>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <i className="size-2 rounded-sm bg-muted-foreground/40" /> cache read <b className="ml-auto tabular-nums text-foreground">{fmtCompact(tokens.cacheRead)}</b>
        </span>
      </div>
      {typeof cost === "number" && (
        <div className="mt-2 border-t border-border pt-2 text-right font-mono text-sm">
          <span className="text-muted-foreground">cost</span>{" "}
          <b className="tabular-nums">{fmtCost(cost)}</b>
        </div>
      )}
    </div>
  )
}
