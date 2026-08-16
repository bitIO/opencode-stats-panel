import { AlertTriangle, FileSearch, Flame, Repeat2, TimerOff } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { AppShell, PageHeader, type Navigate } from "@/components/AppShell"
import { KpiCard } from "@/components/KpiCard"
import { SessionList } from "@/components/SessionList"
import { useApi } from "@/hooks/use-api"
import { api } from "@/lib/api"
import { fmtCompact, fmtCost, fmtPct } from "@/lib/format"

const TOOL_COLOR: Record<string, string> = {
  read: "text-sky-400",
  bash: "text-amber-400",
  webfetch: "text-violet-400",
  websearch: "text-violet-400",
  task: "text-emerald-400",
  grep: "text-rose-400",
  glob: "text-rose-400",
  edit: "text-cyan-400",
}

export function WastePage({
  onNavigate,
  onSelectSession,
}: {
  onNavigate: Navigate
  onSelectSession: (id: string) => void
}) {
  const { data, loading } = useApi(api.waste, [])

  return (
    <AppShell page="waste" onNavigate={onNavigate}>
      <PageHeader
        index="02"
        title="Waste & Insights"
        subtitle="Where tokens burn and what to do about it"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        {data && (
          <>
            <KpiCard
              label="Tool output re-fed"
              value={fmtCompact(data.toolOutput.totalChars)}
              hint={`≈ ${fmtCompact(data.toolOutput.estTokens)} tokens of context`}
              icon={Repeat2}
              tone="bad"
            />
            <KpiCard
              label="Cache miss (input)"
              value={fmtCompact(data.cache.input)}
              hint={`${fmtPct(1 - data.cache.hitRate, 1)} re-billed every call`}
              icon={TimerOff}
              tone={data.cache.hitRate > 0.85 ? "good" : "warn"}
            />
            <KpiCard
              label="Dead sessions"
              value={String(data.zeroOutputSessions)}
              hint="started, produced nothing"
              icon={Flame}
              tone="warn"
            />
            <KpiCard
              label="Agent avg cost / session"
              value={fmtCost(
                data.byAgent.reduce((acc, a) => acc + a.cost, 0) /
                  Math.max(data.byAgent.reduce((acc, a) => acc + a.sessions, 0), 1),
              )}
              hint="weighted across agents"
              icon={FileSearch}
            />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tool output bloat</CardTitle>
            <CardDescription>
              Total output characters these tools fed back into context
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="space-y-2.5">
                {data?.toolOutput.byTool.slice(0, 8).map((t) => {
                  const max = Math.max(...data.toolOutput.byTool.map((x) => x.outputChars), 1)
                  return (
                    <div key={t.tool}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className={`font-mono text-xs ${TOOL_COLOR[t.tool] ?? "text-foreground"}`}>
                          {t.tool}
                          <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                            {t.calls} calls
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {fmtCompact(t.outputChars)} chars · ≈{fmtCompact(t.outputChars / 4)} tok
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500/70 to-red-500/70"
                          style={{ width: `${(t.outputChars / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Agent efficiency</CardTitle>
            <CardDescription>Tokens and cost per agent, normalized</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>agent</TableHead>
                    <TableHead className="text-right">sessions</TableHead>
                    <TableHead className="text-right">avg tok/sess</TableHead>
                    <TableHead className="text-right">cache</TableHead>
                    <TableHead className="text-right">cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.byAgent.map((a) => (
                    <TableRow key={a.agent}>
                      <TableCell className="font-mono text-xs">{a.agent}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">{a.sessions}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">{fmtCompact(a.avgTokensPerSession)}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">{fmtPct(a.cacheHitRate, 0)}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">{fmtCost(a.cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-amber-400" /> Fat input, thin output
              </span>
            </CardTitle>
            <CardDescription>Huge context, very little produced</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <SessionList sessions={data?.fatSessions ?? []} onSelect={onSelectSession} valueKey="tokensInput" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              <span className="flex items-center gap-2">
                <Flame className="size-3.5 text-red-400" /> Most expensive sessions
              </span>
            </CardTitle>
            <CardDescription>Sorted by billed cost</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <SessionList sessions={data?.expensiveSessions ?? []} onSelect={onSelectSession} valueKey="cost" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">
            <span className="flex items-center gap-2">
              <TimerOff className="size-3.5 text-sky-400" /> Low cache-hit sessions
            </span>
          </CardTitle>
          <CardDescription>Big inputs that barely reuse cache — every token re-billed</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <SessionList sessions={data?.lowCacheHitSessions ?? []} onSelect={onSelectSession} valueKey="tokensInput" />
          )}
        </CardContent>
      </Card>
    </AppShell>
  )
}
