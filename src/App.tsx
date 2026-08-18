import { useState } from "react"
import { OverviewPage } from "@/pages/OverviewPage"
import { CompositionPage } from "@/pages/CompositionPage"
import { WastePage } from "@/pages/WastePage"
import { SessionsPage } from "@/pages/SessionsPage"
import { AnalyzePage } from "@/pages/AnalyzePage"
import { SessionDrawer } from "@/components/SessionDrawer"
import { ProjectProvider } from "@/lib/project"
import type { PageKey } from "@/components/AppShell"

export default function App() {
  return (
    <ProjectProvider>
      <Panel />
    </ProjectProvider>
  )
}

function Panel() {
  const [page, setPage] = useState<PageKey>("overview")
  const [sessionId, setSessionId] = useState<string | null>(null)

  const common = {
    onNavigate: setPage,
    onSelectSession: setSessionId,
  }

  return (
    <>
      {page === "overview" && <OverviewPage {...common} />}
      {page === "composition" && <CompositionPage {...common} />}
      {page === "waste" && <WastePage {...common} />}
      {page === "sessions" && <SessionsPage {...common} />}
      {page === "analyze" && <AnalyzePage onNavigate={setPage} />}
      <SessionDrawer sessionId={sessionId} onClose={() => setSessionId(null)} />
    </>
  )
}
