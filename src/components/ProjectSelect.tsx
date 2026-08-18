import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronsUpDown, FolderOpen, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useProject } from "@/lib/project"
import { cn } from "@/lib/utils"

export function ProjectSelect() {
  const { projects, project, setProject, attention } = useProject()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = projects.find((p) => p.directory === project) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...projects].sort((a, b) => a.project.localeCompare(b.project))
    if (!q) return list
    return list.filter(
      (p) => p.project.toLowerCase().includes(q) || p.directory.toLowerCase().includes(q),
    )
  }, [projects, query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const reset = () => {
    setProject(null)
    setQuery("")
    setOpen(false)
  }

  const pick = (directory: string) => {
    setProject(directory)
    setQuery("")
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "h-8 w-full justify-between px-2.5 text-xs",
            attention && "attention-seeker",
          )}
          title={selected?.directory}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{selected ? selected.project : "All projects"}</span>
          </span>
          <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
        {selected && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={reset}
            aria-label="Show all projects"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-md border bg-popover shadow-lg">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to filter projects…"
            className="rounded-none border-0 border-b bg-transparent px-3 py-2 text-xs focus-visible:ring-0"
          />
          <ul className="max-h-64 overflow-y-auto p-1">
            <li>
              <button
                type="button"
                onClick={reset}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                  !project ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <span className="truncate">All projects</span>
                {!project && <Check className="ml-auto size-3.5 shrink-0" />}
              </button>
            </li>
            {filtered.map((p) => (
              <li key={p.directory}>
                <button
                  type="button"
                  onClick={() => pick(p.directory)}
                  title={p.directory}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                    project === p.directory ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                >
                  <span className="truncate">{p.project}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                    {p.sessions}
                  </span>
                  {project === p.directory && <Check className="size-3.5 shrink-0" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-3 text-center font-mono text-[11px] text-muted-foreground">
                no matches
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}