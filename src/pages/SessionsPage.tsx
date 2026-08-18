import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { AppShell, PageHeader, type Navigate } from "@/components/AppShell"
import { ModelBadge } from "@/components/SessionDrawer"
import { useApi } from "@/hooks/use-api"
import { api, type SessionSummary } from "@/lib/api"
import { fmtCompact, fmtCost, fmtRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useProject } from "@/lib/project"

type SortKey = "time" | "cost" | "tokens"

const PAGE_SIZE = 30

export function SessionsPage({
  onNavigate,
  onSelectSession,
}: {
  onNavigate: Navigate
  onSelectSession: (id: string) => void
}) {
  const [sort, setSort] = useState<SortKey>("time")
  const [dir, setDir] = useState<"asc" | "desc">("desc")
  const [offset, setOffset] = useState(0)
  const { project } = useProject()

  const { data, loading } = useApi(
    () => api.sessions({ limit: PAGE_SIZE, offset, sort, dir }, project),
    [offset, sort, dir, project],
  )

  useEffect(() => setOffset(0), [sort, dir])

  const toggleSort = (key: SortKey) => {
    if (key === sort) {
      setDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSort(key)
      setDir("desc")
    }
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  const SortHead = ({
    label,
    column,
    className,
  }: {
    label: string
    column: SortKey
    className?: string
  }) => (
    <TableHead className={cn("cursor-pointer select-none", className)} onClick={() => toggleSort(column)}>
      <span className="flex items-center justify-end gap-1">
        {label}
        {sort === column ? (
          dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />
        ) : null}
      </span>
    </TableHead>
  )

  return (
    <AppShell page="sessions" onNavigate={onNavigate}>
      <PageHeader
        index="03"
        title="Sessions"
        subtitle={`${data?.total ?? "…"} sessions — click a row to drill in`}
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage <= 1}
              onClick={() => setOffset((o) => Math.max(o - PAGE_SIZE, 0))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="w-16 text-center font-mono text-xs text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage >= totalPages}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">session</TableHead>
              <TableHead>model</TableHead>
              <TableHead>agent</TableHead>
              <SortHead label="cost" column="cost" className="text-right" />
              <SortHead label="tokens" column="tokens" className="text-right" />
              <TableHead className="text-right">tools</TableHead>
              <SortHead label="when" column="time" className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-4" colSpan={7}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              data?.sessions.map((s: SessionSummary) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-secondary/50"
                  onClick={() => onSelectSession(s.id)}
                >
                  <TableCell className="max-w-[320px] pl-4">
                    <div className="truncate text-xs font-medium">{s.title || "(untitled)"}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {s.project}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ModelBadge raw={s.model} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.agent}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {fmtCost(s.cost)}
                    {s.errors > 0 && <span className="ml-1 text-red-400">⚠{s.errors}</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {fmtCompact(s.tokens.input + s.tokens.output + s.tokens.reasoning)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {s.toolCalls}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                    {fmtRelative(s.timeCreated)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  )
}
