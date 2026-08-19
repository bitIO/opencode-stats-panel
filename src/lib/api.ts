export interface Tokens {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

export interface Overview {
  sessions: number
  firstSeen: number
  lastSeen: number
  tokens: Tokens
  cacheHitRate: number
  cost: number
}

export interface TimeseriesPoint {
  bucket: string
  sessions: number
  tokensInput: number
  tokensOutput: number
  tokensReasoning: number
  tokensCacheRead: number
  cost: number
}

export interface BreakdownRow {
  key: string
  sessions: number
  tokensInput: number
  tokensOutput: number
  tokensReasoning: number
  tokensCacheRead: number
  cost: number
  cacheHitRate: number
}

export interface SessionSummary {
  id: string
  title: string
  directory: string
  project: string
  agent: string
  model: string
  timeCreated: number
  timeUpdated: number
  tokens: Tokens
  cost: number
  messages: number
  toolCalls: number
  errors: number
  toolOutputChars: number
}

export interface SessionsResponse {
  total: number
  sessions: SessionSummary[]
}

export interface WasteSession {
  id: string
  title: string
  project: string
  agent: string
  timeCreated: number
  tokensInput: number
  tokensOutput: number
  tokensCacheRead: number
  cacheHitRate: number
  cost: number
  messages: number
  toolCalls: number
}

export interface AgentEfficiency {
  agent: string
  sessions: number
  tokensInput: number
  tokensOutput: number
  cacheRead: number
  cost: number
  cacheHitRate: number
  avgTokensPerSession: number
}

export interface Waste {
  cache: { hitRate: number; cacheRead: number; input: number }
  toolOutput: {
    totalChars: number
    estTokens: number
    byTool: Array<{ tool: string; calls: number; outputChars: number }>
  }
  zeroOutputSessions: number
  lowCacheHitSessions: WasteSession[]
  fatSessions: WasteSession[]
  expensiveSessions: WasteSession[]
  byAgent: AgentEfficiency[]
}

export interface SessionPart {
  type: string
  tool?: string
  skillName?: string | null
  state?: string
  outputChars: number
}

export const COMPOSITION_CATEGORIES = [
  "user",
  "assistant",
  "reasoning",
  "toolInput",
  "toolOutput",
  "mcp",
  "patch",
  "scaffold",
] as const
export type CompositionCategory = (typeof COMPOSITION_CATEGORIES)[number]

export type Composition = Record<CompositionCategory, number>

export interface CompositionRow {
  key: string
  kind: "all" | "model" | "agent"
  name: string
  sessions: number
  categories: Composition
  total: number
}

export interface CompositionResponse {
  all: CompositionRow
  byModel: CompositionRow[]
  byAgent: CompositionRow[]
}

export interface SessionMessage {
  id: string
  timeCreated: number
  role: string
  estTokens: number
  categories: Composition
  parts: SessionPart[]
}

export interface SessionDetail {
  id: string
  title: string
  directory: string
  agent: string
  model: string
  timeCreated: number
  timeUpdated: number
  tokens: Tokens
  cost: number
  composition: Composition
  scaffoldEstTokens: number
  contentEstTokens: number
  messages: SessionMessage[]
}

export interface AnalysisSummary {
  id: number
  focus: string
  created_at: number
  output_len: number
}

export interface Analysis {
  id: number
  focus: string
  output: string
  model: string
  source: string
  created_at: number
}

export interface ProjectOption {
  directory: string
  project: string
  sessions: number
}

export interface SkillsParams {
  project?: string | null
  since?: number | null
  agent?: string | null
  granularity?: "day" | "week"
}

export interface SkillsResponse {
  totals: {
    invocations: number
    skills: number
    sessions: number
    cost: number
    errorInvocations: number
  }
  skills: Array<{
    name: string
    origin: "built-in" | "project" | "global" | "unknown"
    invocations: number
    errors: number
    errorRate: number
    sessions: number
    deadSessions: number
    deadSessionRate: number
    reuse: number
    cost: number
    costPerSession: number
    lastUsed: number
  }>
  timeseries: Array<{ bucket: string; invocations: number; errors: number }>
  byProject: Array<{ project: string; invocations: number; skills: number }>
  byAgent: Array<{ agent: string; invocations: number; skills: number }>
  sessions: Array<{
    id: string
    title: string
    directory: string
    agent: string
    timeCreated: number
    skills: string[]
  }>
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

function withProject(path: string, project?: string | null): string {
  if (!project) return path
  const sep = path.includes("?") ? "&" : "?"
  return `${path}${sep}project=${encodeURIComponent(project)}`
}

export const api = {
  projects: () => request<ProjectOption[]>("/api/projects"),
  overview: (project?: string | null) => request<Overview>(withProject("/api/overview", project)),
  timeseries: (granularity: "day" | "week", project?: string | null) =>
    request<TimeseriesPoint[]>(withProject(`/api/timeseries?granularity=${granularity}`, project)),
  breakdown: (by: "model" | "agent" | "project", project?: string | null) =>
    request<BreakdownRow[]>(withProject(`/api/breakdown?by=${by}`, project)),
  waste: (project?: string | null) => request<Waste>(withProject("/api/waste", project)),
  composition: (project?: string | null) =>
    request<CompositionResponse>(withProject("/api/composition", project)),
  compositionSessions: (limit = 12, project?: string | null) =>
    request<{ sessions: Array<{ id: string; title: string; project: string; agent: string; cost: number; categories: Composition; total: number }> }>(
      withProject(`/api/composition/sessions?limit=${limit}`, project),
    ),
  sessions: (params: { limit?: number; offset?: number; sort?: string; dir?: string }, project?: string | null) => {
    const q = new URLSearchParams()
    if (params.limit) q.set("limit", String(params.limit))
    if (params.offset) q.set("offset", String(params.offset))
    if (params.sort) q.set("sort", params.sort)
    if (params.dir) q.set("dir", params.dir)
    if (project) q.set("project", project)
    return request<SessionsResponse>(`/api/sessions?${q}`)
  },
  sessionDetail: (id: string) => request<SessionDetail>(`/api/sessions/${id}`),
  skills: (params: SkillsParams) => {
    const q = new URLSearchParams()
    if (params.project) q.set("project", params.project)
    if (params.since) q.set("since", String(params.since))
    if (params.agent) q.set("agent", params.agent)
    if (params.granularity) q.set("granularity", params.granularity)
    return request<SkillsResponse>(`/api/skills?${q}`)
  },
  analysisList: () => request<AnalysisSummary[]>("/api/analysis"),
  analysisDetail: (id: number) => request<Analysis>(`/api/analysis/${id}`),
  analysisDelete: (id: number) =>
    request<{ ok: boolean }>(`/api/analysis/${id}`, { method: "DELETE" }),
}
