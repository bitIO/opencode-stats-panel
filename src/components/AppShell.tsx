import type { ReactNode } from "react"
import { Activity, Boxes, Flame, List, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export type PageKey = "overview" | "composition" | "waste" | "sessions" | "analyze"
export type Navigate = (page: PageKey) => void

const NAV: Array<{ key: PageKey; label: string; icon: typeof Activity; blurb: string }> = [
  { key: "overview", label: "Overview", icon: Activity, blurb: "Totals, trends, breakdowns" },
  { key: "composition", label: "Composition", icon: Boxes, blurb: "What the context is made of" },
  { key: "waste", label: "Waste & Insights", icon: Flame, blurb: "Where tokens burn" },
  { key: "sessions", label: "Sessions", icon: List, blurb: "Drill into every run" },
  { key: "analyze", label: "AI Analysis", icon: Sparkles, blurb: "big-pickle reads the data" },
]

interface AppShellProps {
  page: PageKey
  onNavigate: (page: PageKey) => void
  children: ReactNode
  dbStatus?: string
}

export function AppShell({ page, onNavigate, children, dbStatus }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
          <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary font-mono text-sm font-bold text-sidebar-primary-foreground">
            ⟨/⟩
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">opencode</div>
            <div className="font-mono text-[11px] text-muted-foreground">stats panel</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item, i) => {
            const Icon = item.icon
            const active = page === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <span className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                  0{i + 1}
                </span>
                <Icon
                  className={cn("mt-0.5 size-4", active ? "text-sidebar-primary" : "text-muted-foreground")}
                />
                <span>
                  <span className="block text-[13px] font-medium leading-tight">{item.label}</span>
                  <span className="block text-[11px] text-muted-foreground/80">{item.blurb}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="border-t border-sidebar-border px-5 py-4">
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", dbStatus ? "bg-emerald-400" : "bg-red-400")} />
            {dbStatus ? "db · live read-only" : "db · disconnected"}
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/60">
            {dbStatus}
          </div>
        </div>
      </aside>

      <main className="ml-60 flex-1">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}

interface PageHeaderProps {
  index: string
  title: string
  subtitle: string
  actions?: ReactNode
}

export function PageHeader({ index, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex items-end justify-between gap-4">
      <div>
        <div className="mb-1 font-mono text-xs text-muted-foreground">
          <span className="text-primary">$</span> {index} — /{title.toLowerCase().replace(/\s+/g, "-")}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {actions}
    </header>
  )
}
