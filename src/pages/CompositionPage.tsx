import { useState } from "react"
import { Boxes, CircleDollarSign, Layers3, Repeat2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppShell, PageHeader, type Navigate } from "@/components/AppShell"
import { KpiCard } from "@/components/KpiCard"
import { CompositionBar, CompositionLegend, CATEGORY_META } from "@/components/CompositionBar"
import { useApi } from "@/hooks/use-api"
import { api, COMPOSITION_CATEGORIES, type CompositionRow } from "@/lib/api"
import { fmtCompact, fmtCost } from "@/lib/format"
import { cn } from "@/lib/utils"

type Scope = "all" | "model" | "agent"

export function CompositionPage({
  onNavigate,
  onSelectSession,
}: {
  onNavigate: Navigate
  onSelectSession: (id: string) => void
}) {
  const [scope, setScope] = useState<Scope>("all")
  const { data, loading } = useApi(api.composition, [])
  const sessions = useApi(() => api.compositionSessions(14), [])

  const rows: CompositionRow[] =
    scope === "all" ? (data ? [data.all] : []) : scope === "model" ? data?.byModel ?? [] : data?.byAgent ?? []
  const title =
    scope === "all" ? "All sessions" : scope === "model" ? "Per model" : "Per agent"

  return (
    <AppShell page="composition" onNavigate={onNavigate}>
      <PageHeader
        index="02"
        title="Context Composition"
        subtitle="What every token in the context is actually spent on"
      />

      {loading || !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              label="Scaffold (system + MCP defs)"
              value={fmtCompact(data.all.categories.scaffold)}
              hint={`${((data.all.categories.scaffold / data.all.total) * 100).toFixed(1)}% of estimated context`}
              icon={Boxes}
              tone="warn"
            />
            <KpiCard
              label="Tool output re-fed"
              value={fmtCompact(data.all.categories.toolOutput)}
              hint={`${fmtCompact(data.all.categories.mcp)} tok on MCP calls`}
              icon={Repeat2}
              tone="bad"
            />
            <KpiCard
              label="Reasoning tokens"
              value={fmtCompact(data.all.categories.reasoning)}
              hint={`${((data.all.categories.reasoning / data.all.total) * 100).toFixed(1)}% of context`}
              icon={Layers3}
            />
            <KpiCard
              label="MCP tool tokens"
              value={fmtCompact(data.all.categories.mcp)}
              hint={`${((data.all.categories.mcp / data.all.total) * 100).toFixed(1)}% of context`}
              icon={CircleDollarSign}
              tone="good"
            />
          </div>
        </>
      )}

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            <CardDescription>
              Estimated token share by origin — colors match the legend
            </CardDescription>
          </div>
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList>
              <TabsTrigger value="all">all</TabsTrigger>
              <TabsTrigger value="model">by model</TabsTrigger>
              <TabsTrigger value="agent">by agent</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="space-y-4">
          <CompositionLegend />
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-xs">
                      {r.name}
                      <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                        {r.sessions} sess
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {fmtCompact(r.total)} tok
                    </span>
                  </div>
                  <CompositionBar categories={r.categories} total={r.total} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">What the scaffold actually costs</CardTitle>
            <CardDescription>
              System prompt + tool schemas + MCP definitions are re-sent with every step
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading || !data ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <CategoryTable row={data.all} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top sessions by context size</CardTitle>
            <CardDescription>Click a bar to inspect the session</CardDescription>
          </CardHeader>
          <CardContent>
            {sessions.loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="space-y-3">
                {sessions.data?.sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelectSession(s.id)}
                    className="block w-full text-left transition-opacity hover:opacity-80"
                  >
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs">
                        {s.title || "(untitled)"}
                        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/60">
                          {s.agent}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {fmtCompact(s.total)} tok · {fmtCost(s.cost)}
                      </span>
                    </div>
                    <CompositionBar categories={s.categories} total={s.total} height="h-2.5" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

function CategoryTable({ row }: { row: CompositionRow }) {
  const ordered = COMPOSITION_CATEGORIES.filter((c) => row.categories[c] > 0).sort(
    (a, b) => row.categories[b] - row.categories[a],
  )
  const max = row.total
  return (
    <div className="space-y-2">
      {ordered.map((c) => {
        const v = row.categories[c]
        const pct = (v / max) * 100
        return (
          <div key={c} className="flex items-center gap-3">
            <span
              className={cn("w-2 shrink-0 self-stretch rounded-full", CATEGORY_META[c].className)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs">{CATEGORY_META[c].label}</span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {fmtCompact(v)} tok · {pct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full", CATEGORY_META[c].className)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
