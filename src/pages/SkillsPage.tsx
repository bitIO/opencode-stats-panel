import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { AlertTriangle, Boxes, ChevronRight, Timer, X, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppShell, PageHeader, type Navigate } from "@/components/AppShell"
import { KpiCard } from "@/components/KpiCard"
import { useApi } from "@/hooks/use-api"
import { api, type SkillsResponse } from "@/lib/api"
import { fmtCompact, fmtCost, fmtPct, fmtRelative } from "@/lib/format"
import { useProject } from "@/lib/project"
import { cn } from "@/lib/utils"

type RangeKey = "7d" | "30d" | "90d" | "all"

const RANGE_MS: Record<Exclude<RangeKey, "all">, number> = {
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
}

const chartConfig = {
  invocations: { label: "invocations", color: "var(--chart-1)" },
  errors: { label: "errors", color: "var(--chart-4)" },
} satisfies ChartConfig

const ORIGIN_STYLE: Record<SkillsResponse["skills"][number]["origin"], string> = {
  "built-in": "border-sky-400/30 bg-sky-400/10 text-sky-400",
  project: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400",
  global: "border-violet-400/30 bg-violet-400/10 text-violet-400",
  unknown: "border-border bg-secondary text-muted-foreground",
}

export function SkillsPage({
  onNavigate,
  onSelectSession,
}: {
  onNavigate: Navigate
  onSelectSession: (id: string) => void
}) {
  const [range, setRange] = useState<RangeKey>("all")
  const [agent, setAgent] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<"day" | "week">("week")
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const { project } = useProject()

  const since = useMemo(() => (range === "all" ? null : Date.now() - RANGE_MS[range]), [range])
  const { data, loading } = useApi(
    () => api.skills({ project, since, agent, granularity }),
    [project, since, agent, granularity],
  )

  const agents = useMemo(
    () => [...new Set((data?.byAgent ?? []).map((a) => a.agent))].sort(),
    [data],
  )
  const totalSessions = data?.totals.sessions ?? 0
  const sessions = data
    ? selectedSkill
      ? data.sessions.filter((s) => s.skills.includes(selectedSkill))
      : data.sessions
    : []
  const empty = Boolean(data && data.totals.invocations === 0)

  return (
    <AppShell page="skills" onNavigate={onNavigate} dbStatus={data ? "opencode.db" : undefined}>
      <PageHeader
        index="04"
        title="Skills"
        subtitle={`${data ? fmtCompact(data.totals.invocations) : "…"} invocations · ${data ? fmtCompact(data.totals.skills) : "…"} skills`}
        actions={
          <div className="flex items-center gap-2">
            <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <TabsList>
                <TabsTrigger value="7d">7d</TabsTrigger>
                <TabsTrigger value="30d">30d</TabsTrigger>
                <TabsTrigger value="90d">90d</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={agent ?? "all"} onValueChange={(v) => setAgent(v === "all" ? null : v)}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {empty ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="mx-auto size-6 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">No skill invocations here</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Widen the time range or switch the project filter to see skills in action.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {loading && !data &&
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            {data && (
              <>
                <KpiCard
                  label="Skill invocations"
                  value={fmtCompact(data.totals.invocations)}
                  hint={`${fmtCompact(data.totals.sessions)} sessions`}
                  icon={Zap}
                />
                <KpiCard
                  label="Distinct skills"
                  value={fmtCompact(data.totals.skills)}
                  hint="in current scope"
                  icon={Boxes}
                />
                <KpiCard
                  label="Sessions using skills"
                  value={fmtCompact(data.totals.sessions)}
                  hint="distinct sessions that invoked one"
                  icon={Timer}
                />
                <KpiCard
                  label="Error invocations"
                  value={fmtCompact(data.totals.errorInvocations)}
                  hint={`${fmtPct(data.totals.errorInvocations / Math.max(data.totals.invocations, 1), 0)} of invocations`}
                  icon={AlertTriangle}
                  tone={data.totals.errorInvocations > 0 ? "warn" : "good"}
                />
              </>
            )}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Top skills</CardTitle>
                <CardDescription>Ranked by invocations — click to filter sessions</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <div className="divide-y divide-border rounded-md border">
                    {(data?.skills ?? []).slice(0, 12).map((s) => (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => setSelectedSkill(selectedSkill === s.name ? null : s.name)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-secondary/50",
                          selectedSkill === s.name && "bg-secondary/70",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-mono text-xs font-medium">{s.name}</span>
                            <Badge variant="outline" className={cn("px-1 text-[9px] font-normal", ORIGIN_STYLE[s.origin])}>
                              {s.origin}
                            </Badge>
                          </div>
                        </div>
                        <div className="shrink-0 text-right font-mono text-xs tabular-nums">
                          <div>{fmtCompact(s.invocations)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {s.errors > 0 && <span className="text-red-400">⚠{s.errors} · </span>}
                            {fmtRelative(s.lastUsed)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Skill usage over time</CardTitle>
                  <CardDescription>Invocations and errors per bucket</CardDescription>
                </div>
                <Tabs value={granularity} onValueChange={(v) => setGranularity(v as "day" | "week")}>
                  <TabsList>
                    <TabsTrigger value="week">week</TabsTrigger>
                    <TabsTrigger value="day">day</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                {loading && <Skeleton className="h-64 w-full" />}
                {data && (
                  <ChartContainer config={chartConfig} className="h-64 w-full">
                    <AreaChart data={data.timeseries} margin={{ left: 0, right: 8, top: 4 }}>
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
                      <Area dataKey="invocations" name="invocations" fill="var(--chart-1)" stroke="var(--chart-1)" />
                      <Area dataKey="errors" name="errors" fill="var(--chart-4)" stroke="var(--chart-4)" />
                      <ChartLegend className="mt-3" />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Skills by project</CardTitle>
                <CardDescription>Invocations and distinct skills per repo</CardDescription>
              </CardHeader>
              <CardContent className="h-64 overflow-y-auto">
                {loading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <GroupBars
                    rows={(data?.byProject ?? []).map((r) => ({
                      name: r.project,
                      invocations: r.invocations,
                      skills: r.skills,
                    }))}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Skills by agent</CardTitle>
                <CardDescription>Who invokes skills the most</CardDescription>
              </CardHeader>
              <CardContent className="h-64 overflow-y-auto">
                {loading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <GroupBars
                    rows={(data?.byAgent ?? []).map((r) => ({
                      name: r.agent,
                      invocations: r.invocations,
                      skills: r.skills,
                    }))}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-sm">Effectiveness</CardTitle>
              <CardDescription>
                Error rate, dead-session rate, reuse and cost per session
                <span className="block text-[10px] text-muted-foreground/70">
                  session cost is attributed fully to every skill used in that session
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto">
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-0">skill</TableHead>
                      <TableHead className="text-right">invocations</TableHead>
                      <TableHead className="text-right">error rate</TableHead>
                      <TableHead className="text-right">dead rate</TableHead>
                      <TableHead className="text-right">reuse</TableHead>
                      <TableHead className="text-right">cost/session</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.skills ?? []).map((s) => (
                      <TableRow key={s.name}>
                        <TableCell className="pl-0 font-mono text-xs">{s.name}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {fmtCompact(s.invocations)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          <span className={s.errors > 0 ? "text-red-400" : undefined}>{fmtPct(s.errorRate, 0)}</span>
                          <span className="ml-1 text-[10px] text-muted-foreground/60">
                            {s.errors}/{s.invocations}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {fmtPct(s.deadSessionRate, 0)}
                          <span className="ml-1 text-[10px] text-muted-foreground/60">
                            {s.deadSessions}/{s.sessions}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {fmtPct(s.reuse, 0)}
                          <span className="ml-1 text-[10px] text-muted-foreground/60">
                            {s.sessions}/{totalSessions}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {fmtCost(s.costPerSession)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-sm">Sessions using skills</CardTitle>
                <CardDescription>
                  {selectedSkill
                    ? `filtered to ${selectedSkill}`
                    : `${sessions.length} sessions — click a row to drill in`}
                </CardDescription>
              </div>
              {selectedSkill && (
                <Button variant="outline" size="sm" onClick={() => setSelectedSkill(null)}>
                  <X className="size-3" /> clear
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : sessions.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  no sessions match these filters
                </div>
              ) : (
                <div className="divide-y divide-border rounded-md border">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectSession(s.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{s.title || "(untitled)"}</div>
                        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                          <span className="truncate">{s.directory}</span>
                          <span>·</span>
                          <span>{s.agent}</span>
                          <span>·</span>
                          <span>{fmtRelative(s.timeCreated)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {s.skills.slice(0, 6).map((name) => (
                            <span
                              key={name}
                              className={cn(
                                "rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]",
                                selectedSkill === name && "text-primary",
                              )}
                            >
                              {name}
                            </span>
                          ))}
                          {s.skills.length > 6 && (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              +{s.skills.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  )
}

function GroupBars({ rows }: { rows: Array<{ name: string; invocations: number; skills: number }> }) {
  if (rows.length === 0) return <div className="text-xs text-muted-foreground">no skill usage in scope</div>
  const max = Math.max(...rows.map((r) => r.invocations), 1)
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate font-mono text-xs">{r.name}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {fmtCompact(r.invocations)}
              <span className="ml-1.5 text-[10px] text-muted-foreground/60">· {r.skills} skills</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-gradient-to-r from-chart-1 to-chart-5"
              style={{ width: `${Math.max((r.invocations / max) * 100, 1.5)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
