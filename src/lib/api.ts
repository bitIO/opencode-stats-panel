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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  overview: () => request<Overview>("/api/overview"),
  timeseries: (granularity: "day" | "week") =>
    request<TimeseriesPoint[]>(`/api/timeseries?granularity=${granularity}`),
  breakdown: (by: "model" | "agent" | "project") =>
    request<BreakdownRow[]>(`/api/breakdown?by=${by}`),
  waste: () => request<Waste>("/api/waste"),
  composition: () => request<CompositionResponse>("/api/composition"),
  compositionSessions: (limit = 12) =>
    request<{ sessions: Array<{ id: string; title: string; project: string; agent: string; cost: number; categories: Composition; total: number }> }>(
      `/api/composition/sessions?limit=${limit}`,
    ),
  sessions: (params: { limit?: number; offset?: number; sort?: string; dir?: string }) => {
    const q = new URLSearchParams()
    if (params.limit) q.set("limit", String(params.limit))
    if (params.offset) q.set("offset", String(params.offset))
    if (params.sort) q.set("sort", params.sort)
    if (params.dir) q.set("dir", params.dir)
    return request<SessionsResponse>(`/api/sessions?${q}`)
  },
  sessionDetail: (id: string) => request<SessionDetail>(`/api/sessions/${id}`),
}
