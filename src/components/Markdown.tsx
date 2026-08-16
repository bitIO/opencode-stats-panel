import { useMemo } from "react"
import { marked } from "marked"
import DOMPurify from "dompurify"

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text, { async: false, gfm: true, breaks: true }) as string
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
  }, [text])
  return <div className="markdown text-sm" dangerouslySetInnerHTML={{ __html: html }} />
}
