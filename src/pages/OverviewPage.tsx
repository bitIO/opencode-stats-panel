import { useState, type ReactNode } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChevronRight, DollarSign, Gauge, Layers, Timer } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppShell, PageHeader, type Navigate } from "@/components/AppShell"
import { KpiCard } from "@/components/KpiCard"
import { BreakdownBars } from "@/components/BreakdownBars"
import { useApi } from "@/hooks/use-api"
import { api, type SessionSummary } from "@/lib/api"
import { fmtCompact, fmtCost, fmtDuration, fmtPct, fmtRelative } from "@/lib/format"

const chartConfig = {
  input: { label: "input", color: "var(--chart-1)" },
  reasoning: { label: "reasoning", color: "var(--chart-4)" },
  output: { label: "output", color: "var(--chart-2)" },
} satisfies ChartConfig
export function OverviewPage({
  onNavigate,
  onSelectSession,
}: {
  onNavigate: Navigate
  onSelectSession: (id: string) => void
}) {
  const [granularity, setGranularity] = useState<"day" | "week">("week")
  const overview = useApi(api.overview, [])
  const series = useApi(() => api.timeseries(granularity), [granularity])
  const byModel = useApi(() => api.breakdown("model"), [])
  const byAgent = useApi(() => api.breakdown("agent"), [])
  const byProject = useApi(() => api.breakdown("project"), [])
  const topCost = useApi(() => api.sessions({ limit: 3, sort: "cost" }), [])
  const topTokens = useApi(() => api.sessions({ limit: 3, sort: "tokens" }), [])
  const topTime = useApi(() => api.sessions({ limit: 3, sort: "duration" }), [])
  const recent = useApi(() => api.sessions({ limit: 3, sort: "time" }), [])

  const o = overview.data

  return (
    <AppShell page="overview" onNavigate={onNavigate} dbStatus={o ? "opencode.db" : undefined}>
      <PageHeader
        index="01"
        title="Overview"
        subtitle="Everything opencode has consumed, in one glance"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {!o ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <KpiCard
              label="Total cost"
              value={fmtCost(o.cost)}
              hint={`${o.sessions} sessions`}
              icon={DollarSign}
              tone="warn"
            />
            <KpiCard
              label="Tokens in"
              value={fmtCompact(o.tokens.input)}
              hint={`${fmtCompact(o.tokens.output)} out`}
              icon={Layers}
            />
            <KpiCard
              label="Cache hit rate"
              value={fmtPct(o.cacheHitRate)}
              hint={`${fmtCompact(o.tokens.cacheRead)} cached`}
              icon={Gauge}
              tone={o.cacheHitRate > 0.85 ? "good" : "warn"}
            />
            <KpiCard
              label="Reasoning burn"
              value={fmtCompact(o.tokens.reasoning)}
              hint={`${fmtPct(o.tokens.reasoning / Math.max(o.tokens.input + o.tokens.reasoning + o.tokens.output, 1), 1)} of tokens`}
              icon={Timer}
            />
          </>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Token volume over time</CardTitle>
            <CardDescription>Input, reasoning and output tokens per bucket</CardDescription>
          </div>
          <Tabs value={granularity} onValueChange={(v) => setGranularity(v as "day" | "week")}>
            <TabsList>
              <TabsTrigger value="week">week</TabsTrigger>
              <TabsTrigger value="day">day</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {series.loading && <Skeleton className="h-64 w-full" />}
          {series.data && (
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <AreaChart data={series.data} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  fontSize={11}
                  tickFormatter={(v: number) => fmtCompact(Number(v))}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="tokensInput" name="input" stackId="a" fill="var(--chart-1)" stroke="var(--chart-1)" />
                <Area
                  dataKey="tokensReasoning"
                  name="reasoning"
                  stackId="a"
                  fill="var(--chart-4)"
                  stroke="var(--chart-4)"
                />
                <Area
                  dataKey="tokensOutput"
                  name="output"
                  stackId="a"
                  fill="var(--chart-2)"
                  stroke="var(--chart-2)"
                />
                <ChartLegend className="mt-3" />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cost by model</CardTitle>
            <CardDescription>Where the money went</CardDescription>
          </CardHeader>
          <CardContent className="h-64 overflow-y-auto">
            {byModel.data ? <BreakdownBars rows={byModel.data} valueKey="cost" showCache showSessions /> : <Skeleton className="h-32 w-full" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cost by agent</CardTitle>
            <CardDescription>Agents that burn the most</CardDescription>
          </CardHeader>
          <CardContent className="h-64 overflow-y-auto">
            {byAgent.data ? <BreakdownBars rows={byAgent.data} valueKey="cost" showSessions /> : <Skeleton className="h-32 w-full" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tokens by project</CardTitle>
            <CardDescription>Input tokens per repo</CardDescription>
          </CardHeader>
          <CardContent className="h-64 overflow-y-auto">
            {byProject.data ? <BreakdownBars rows={byProject.data} valueKey="tokensInput" /> : <Skeleton className="h-32 w-full" />}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <button
              type="button"
              onClick={() => onNavigate("sessions")}
              className="group flex items-center gap-1.5"
            >
              <CardTitle className="text-sm transition-colors group-hover:text-foreground">
                Sessions
              </CardTitle>
              <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
            <CardDescription>Top cost, tokens and time — plus the latest runs</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {topCost.loading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <SessionColumn
                title="Top cost"
                sessions={topCost.data?.sessions ?? []}
                onSelect={onSelectSession}
                renderValue={(s) => fmtCost(s.cost)}
              />
            )}
            {topTokens.loading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <SessionColumn
                title="Top tokens"
                sessions={topTokens.data?.sessions ?? []}
                onSelect={onSelectSession}
                renderValue={(s) => fmtCompact(s.tokens.input + s.tokens.output + s.tokens.reasoning)}
              />
            )}
            {topTime.loading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <SessionColumn
                title="Top time"
                sessions={topTime.data?.sessions ?? []}
                onSelect={onSelectSession}
                renderValue={(s) => fmtDuration(s.timeUpdated - s.timeCreated)}
              />
            )}
            {recent.loading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <SessionColumn
                title="Recent"
                sessions={recent.data?.sessions ?? []}
                onSelect={onSelectSession}
                renderValue={(s) => (
                  <span className="whitespace-nowrap">
                    {fmtCompact(s.tokens.input + s.tokens.output)} tok · {fmtCost(s.cost)}
                  </span>
                )}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  )
}

function SessionColumn({
  title,
  sessions,
  onSelect,
  renderValue,
}: {
  title: string
  sessions: SessionSummary[]
  onSelect: (id: string) => void
  renderValue: (s: SessionSummary) => ReactNode
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="divide-y divide-border">
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:bg-secondary/50"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{s.title || "(untitled)"}</div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {s.project}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-[10px] text-muted-foreground">
                {fmtRelative(s.timeCreated)}
              </div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums">{renderValue(s)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
