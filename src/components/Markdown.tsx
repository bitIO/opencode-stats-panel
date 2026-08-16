import { useMemo } from "react"

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function renderInline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code class='rounded bg-secondary px-1 py-0.5 font-mono text-[0.9em]'>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="underline" href="$2">$1</a>')
}

function renderBlock(text: string): string {
  const lines = text.split("\n")
  const out: string[] = []
  let inCode = false
  let codeBuf: string[] = []
  let listType: "ul" | "ol" | null = null

  const flushList = () => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith("```")) {
      if (inCode) {
        out.push(`<pre class="overflow-x-auto rounded-md bg-secondary/60 p-3 font-mono text-xs">${escapeHtml(codeBuf.join("\n"))}</pre>`)
        codeBuf = []
        inCode = false
      } else {
        flushList()
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      flushList()
      const level = heading[1].length
      out.push(`<h${level + 1} class="mt-4 mb-1 font-semibold text-sm">${renderInline(heading[2])}</h${level + 1}>`)
      continue
    }
    const li = line.match(/^[-*]\s+(.*)$/)
    if (li) {
      if (listType !== "ul") {
        flushList()
        out.push("<ul class='mt-2 space-y-1'>")
        listType = "ul"
      }
      out.push(`<li class="ml-4 list-disc">${renderInline(li[1])}</li>`)
      continue
    }
    const num = line.match(/^\d+[.)]\s+(.*)$/)
    if (num) {
      if (listType !== "ol") {
        flushList()
        out.push("<ol class='mt-2 space-y-1'>")
        listType = "ol"
      }
      out.push(`<li class="ml-4 list-decimal">${renderInline(num[1])}</li>`)
      continue
    }
    if (line === "") {
      flushList()
      continue
    }
    flushList()
    out.push(`<p class="mt-2 leading-relaxed">${renderInline(line)}</p>`)
  }
  flushList()
  if (inCode) {
    out.push(`<pre class="overflow-x-auto rounded-md bg-secondary/60 p-3 font-mono text-xs">${escapeHtml(codeBuf.join("\n"))}</pre>`)
  }
  return out.join("")
}

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => renderBlock(text), [text])
  return <div className="space-y-1 text-sm" dangerouslySetInnerHTML={{ __html: html }} />
}
