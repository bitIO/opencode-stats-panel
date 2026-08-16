import { useEffect, useRef, useState } from "react"
import { Loader2, Send, Sparkles, Square, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { AppShell, PageHeader, type Navigate } from "@/components/AppShell"
import { Markdown } from "@/components/Markdown"
import { cn } from "@/lib/utils"

interface SseEvent {
  text?: string
  log?: string
  error?: string
  done?: boolean
  code?: number
}

const STORAGE_KEY = "osp.analyze.v1"

interface StoredAnalysis {
  focus: string
  output: string
  updatedAt: number
}

function loadStored(): StoredAnalysis | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredAnalysis
    if (typeof parsed.focus !== "string" || typeof parsed.output !== "string") return null
    return parsed
  } catch {
    return null
  }
}

function saveStored(value: StoredAnalysis) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* storage full / unavailable — ignore */
  }
}

export function AnalyzePage({
  onNavigate,
}: {
  onNavigate: Navigate
}) {
  const [focus, setFocus] = useState("")
  const [running, setRunning] = useState(false)
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const aborterRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    const stored = loadStored()
    if (stored) {
      setFocus(stored.focus)
      setText(stored.output)
    }
  }, [])

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    const t = setTimeout(() => saveStored({ focus, output: text, updatedAt: Date.now() }), 400)
    return () => clearTimeout(t)
  }, [focus, text])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [text])

  useEffect(() => () => aborterRef.current?.abort(), [])

  const clear = () => {
    setText("")
    setError(null)
    saveStored({ focus, output: "", updatedAt: Date.now() })
  }

  const run = async () => {
    const abort = new AbortController()
    aborterRef.current = abort
    setRunning(true)
    setText("")
    setError(null)
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus: focus.trim() || undefined }),
        signal: abort.signal,
      })
      if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          let ev: SseEvent
          try {
            ev = JSON.parse(line.slice(6)) as SseEvent
          } catch {
            continue
          }
          if (ev.error) setError(ev.error)
          if (ev.text) setText((t) => t + ev.text)
          if (ev.done && ev.code !== 0) setError(`opencode exited with code ${ev.code}`)
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(String((err as Error).message))
      }
    } finally {
      setRunning(false)
      aborterRef.current = null
    }
  }

  return (
    <AppShell page="analyze" onNavigate={onNavigate}>
      <PageHeader
        index="04"
        title="AI Analysis"
        subtitle="opencode/big-pickle reads the live numbers and finds what you're missing"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4 text-chart-2" /> Ask big-pickle
          </CardTitle>
          <CardDescription>
            The model gets a full snapshot — overview, waste indicators, breakdowns and recent
            sessions — and replies with concrete, number-backed recommendations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Optional: focus the analysis — e.g. 'is my cache hit rate healthy?', 'should I use big-pickle for this?'"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            rows={3}
          />
          <div className="flex items-center gap-2">
            <Button onClick={run} disabled={running} className="gap-2">
              {running ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {running ? "Analyzing…" : "Run analysis"}
            </Button>
            {running && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => aborterRef.current?.abort()}
                className="gap-2 text-muted-foreground"
              >
                <Square className="size-3.5" /> stop
              </Button>
            )}
            {!running && text && (
              <Button variant="ghost" size="sm" onClick={clear} className="gap-2 text-muted-foreground">
                <Trash2 className="size-3.5" /> clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="mt-4 border-destructive/40">
          <CardContent className="p-4 font-mono text-xs text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card
        className={cn(
          "mt-4 transition-opacity",
          !text && !running ? "opacity-40" : "opacity-100",
        )}
      >
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="text-emerald-400">›</span> Findings
            </CardTitle>
            <CardDescription>streamed from big-pickle</CardDescription>
          </div>
          {running && (
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              thinking…
            </span>
          )}
        </CardHeader>
        <CardContent>
          <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto pr-2">
            {text ? (
              <Markdown text={text} />
            ) : (
              <div className="py-10 text-center font-mono text-xs text-muted-foreground">
                {running ? "big-pickle is reading the snapshot…" : "Run an analysis to see insights here."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  )
}
