import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { Composition, CompositionCategory } from "@/lib/api"
import { fmtCompact } from "@/lib/format"
import { cn } from "@/lib/utils"

export const CATEGORY_META: Record<
  CompositionCategory,
  { label: string; className: string; tooltip: string }
> = {
  user: {
    label: "user text",
    className: "bg-sky-400",
    tooltip: "User messages",
  },
  assistant: {
    label: "assistant text",
    className: "bg-emerald-400",
    tooltip: "Assistant replies",
  },
  reasoning: {
    label: "reasoning",
    className: "bg-violet-400",
    tooltip: "Chain-of-thought tokens",
  },
  toolInput: {
    label: "tool calls",
    className: "bg-cyan-400",
    tooltip: "Built-in tool call arguments (read, bash, edit…)",
  },
  toolOutput: {
    label: "tool output",
    className: "bg-amber-400",
    tooltip: "Built-in tool results re-fed into context",
  },
  mcp: {
    label: "MCP tools",
    className: "bg-rose-400",
    tooltip: "MCP server calls: inputs + outputs (github_, engram_, context7_…)",
  },
  patch: {
    label: "patches",
    className: "bg-lime-400",
    tooltip: "File patches / diffs",
  },
  scaffold: {
    label: "scaffold",
    className: "bg-zinc-500",
    tooltip: "System prompt + tool schemas + MCP definitions — re-sent every step",
  },
}

const ORDER: CompositionCategory[] = [
  "scaffold",
  "user",
  "assistant",
  "reasoning",
  "toolInput",
  "toolOutput",
  "mcp",
  "patch",
]

export function CompositionBar({
  categories,
  total,
  height = "h-3",
}: {
  categories: Composition
  total: number
  height?: string
}) {
  const nonzero = ORDER.filter((c) => categories[c] > 0)
  return (
    <TooltipProvider delayDuration={0}>
      <div className={cn("flex w-full overflow-hidden rounded-full bg-secondary", height)}>
        {nonzero.length === 0 ? (
          <div className="h-full w-full bg-secondary" />
        ) : (
          nonzero.map((c) => (
            <Tooltip key={c}>
              <TooltipTrigger asChild>
                <div
                  className={cn("h-full", CATEGORY_META[c].className)}
                  style={{ width: `${(categories[c] / Math.max(total, 1)) * 100}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <div className="font-mono text-[11px]">
                  <span className="text-muted-foreground">{CATEGORY_META[c].label}</span>{" "}
                  <b>{fmtCompact(categories[c])} tok</b>
                  <span className="text-muted-foreground">
                    {" "}
                    · {((categories[c] / Math.max(total, 1)) * 100).toFixed(1)}%
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          ))
        )}
      </div>
    </TooltipProvider>
  )
}

export function CompositionLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {ORDER.map((c) => (
        <span key={c} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <i className={cn("size-2 rounded-sm", CATEGORY_META[c].className)} />
          {CATEGORY_META[c].label}
        </span>
      ))}
    </div>
  )
}
