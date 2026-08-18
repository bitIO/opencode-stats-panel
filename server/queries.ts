import path from "node:path"
import type Database from "better-sqlite3"

type Row = Record<string, unknown>

const SESSION_COLS = `s.id, s.title, s.directory, s.agent, s.model, s.tokens_input,
  s.tokens_output, s.tokens_reasoning, s.tokens_cache_read, s.tokens_cache_write,
  s.cost, s.time_created, s.time_updated`

const BUILTIN_TOOLS = new Set([
  "read", "write", "edit", "bash", "grep", "glob", "webfetch", "websearch",
  "task", "agent", "skill", "list", "todowrite", "question", "migrate",
  "patch", "invalid",
])

export function isMcpTool(tool: string): boolean {
  return !BUILTIN_TOOLS.has(tool) && /[_-]/.test(tool)
}

export function modelKey(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { id?: string }
    if (parsed.id) return parsed.id
  } catch {
    /* fall through */
  }
  return raw || "unknown"
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

interface PartCount {
  sessionId: string
  role: string
  type: string
  tool: string
  txt: number
  tin: number
  tout: number
  patch: number
}

function categoryChars(p: PartCount): Record<Exclude<CompositionCategory, "scaffold">, number> {
  const mcp = p.type === "tool" && isMcpTool(p.tool)
  const isUser = p.role === "user"
  return {
    user: p.type === "text" && isUser ? p.txt : 0,
    assistant: p.type === "text" && !isUser ? p.txt : 0,
    reasoning: p.type === "reasoning" ? p.txt : 0,
    toolInput: p.type === "tool" && !mcp ? p.tin : 0,
    toolOutput: p.type === "tool" && !mcp ? p.tout : 0,
    mcp: p.type === "tool" && mcp ? p.tin + p.tout : 0,
    patch: p.type === "patch" ? p.patch : 0,
  }
}

const PART_ROWS_SQL = `
  SELECT p.session_id sessionId, COALESCE(json_extract(m.data, '$.role'), 'assistant') role,
    json_extract(p.data, '$.type') type,
    json_extract(p.data, '$.tool') tool,
    length(COALESCE(json_extract(p.data, '$.text'), '')) txt,
    length(COALESCE(json_extract(p.data, '$.state.input'), '')) tin,
    length(COALESCE(json_extract(p.data, '$.state.output'), '')) tout,
    length(COALESCE(json_extract(p.data, '$.patch'), '')) patch
  FROM part p JOIN message m ON m.id = p.message_id`

function loadPartCounts(db: Database.Database): PartCount[] {
  return (db.prepare(PART_ROWS_SQL).all() as Row[]).map((r) => ({
    sessionId: String(r.sessionId),
    role: String(r.role ?? "assistant"),
    type: String(r.type ?? ""),
    tool: String(r.tool ?? ""),
    txt: Number(r.txt ?? 0),
    tin: Number(r.tin ?? 0),
    tout: Number(r.tout ?? 0),
    patch: Number(r.patch ?? 0),
  }))
}

export function getComposition(db: Database.Database) {
  const parts = loadPartCounts(db)
  const sessions = new Map(
    (db
      .prepare(`SELECT id, agent, model, tokens_input FROM session`)
      .all() as Row[]).map((r) => [
      String(r.id),
      {
        agent: String(r.agent ?? "default"),
        model: String(r.model ?? ""),
        tokensInput: Number(r.tokens_input ?? 0),
      },
    ]),
  )

  type Acc = {
    sessions: number
    chars: Record<Exclude<CompositionCategory, "scaffold">, number>
    tokensInput: number
  }
  const groupAcc = new Map<string, Acc>()
  const keyFor = (key: string) => {
    if (!groupAcc.has(key)) {
      groupAcc.set(key, {
        sessions: 0,
        chars: { user: 0, assistant: 0, reasoning: 0, toolInput: 0, toolOutput: 0, mcp: 0, patch: 0 },
        tokensInput: 0,
      })
    }
    return groupAcc.get(key)!
  }
  keyFor("all")

  for (const p of parts) {
    const cat = categoryChars(p)
    for (const [k, v] of Object.entries(cat)) {
      if (v === 0) continue
      keyFor("all").chars[k as keyof typeof cat] += v
      const s = sessions.get(p.sessionId)
      const key = s ? `model:${modelKey(s.model)}` : "model:?"
      keyFor(key).chars[k as keyof typeof cat] += v
      const aKey = s ? `agent:${s.agent}` : "agent:?"
      keyFor(aKey).chars[k as keyof typeof cat] += v
    }
  }
  for (const [id, s] of sessions) {
    keyFor("all").tokensInput += s.tokensInput
    keyFor(`model:${modelKey(s.model)}`).tokensInput += s.tokensInput
    keyFor(`agent:${s.agent}`).tokensInput += s.tokensInput
    keyFor("all").sessions += 1
    keyFor(`model:${modelKey(s.model)}`).sessions += 1
    keyFor(`agent:${s.agent}`).sessions += 1
    void id
  }

  const toRow = (key: string, acc: Acc) => {
    const allChars = Object.values(acc.chars).reduce((a, b) => a + b, 0)
    // reasoning is billed separately (session.tokens_reasoning), so exclude it
    // when estimating the scaffold from tokens_input.
    const scaffold = Math.max(acc.tokensInput - Math.round((allChars - acc.chars.reasoning) / 4), 0)
    const categories: Record<CompositionCategory, number> = {
      user: Math.round(acc.chars.user / 4),
      assistant: Math.round(acc.chars.assistant / 4),
      reasoning: Math.round(acc.chars.reasoning / 4),
      toolInput: Math.round(acc.chars.toolInput / 4),
      toolOutput: Math.round(acc.chars.toolOutput / 4),
      mcp: Math.round(acc.chars.mcp / 4),
      patch: Math.round(acc.chars.patch / 4),
      scaffold,
    }
    const [kind, name] = key.split(":")
    return {
      key,
      kind: kind === "all" ? "all" : kind,
      name: kind === "all" ? "All sessions" : name,
      sessions: acc.sessions,
      categories,
      total: Object.values(categories).reduce((a, b) => a + b, 0),
    }
  }

  const byGroup = Array.from(groupAcc.entries()).map(([k, a]) => toRow(k, a))
  const all = byGroup.find((r) => r.kind === "all")!
  return {
    all,
    byModel: byGroup.filter((r) => r.kind === "model").sort((a, b) => b.total - a.total),
    byAgent: byGroup.filter((r) => r.kind === "agent").sort((a, b) => b.total - a.total),
  }
}

export function getSessionCompositions(db: Database.Database, limit = 12) {
  const parts = loadPartCounts(db)
  const sessions = new Map(
    (db
      .prepare(`SELECT id, title, directory, agent, tokens_input, cost FROM session`)
      .all() as Row[]).map((r) => [
      String(r.id),
      {
        title: String(r.title ?? ""),
        directory: String(r.directory ?? ""),
        agent: String(r.agent ?? "default"),
        tokensInput: Number(r.tokens_input ?? 0),
        cost: Number(r.cost ?? 0),
      },
    ]),
  )

  const perSession = new Map<
    string,
    { content: Record<Exclude<CompositionCategory, "scaffold">, number>; nonReasoning: number }
  >()
  const accFor = (id: string) => {
    if (!perSession.has(id)) {
      perSession.set(id, {
        content: { user: 0, assistant: 0, reasoning: 0, toolInput: 0, toolOutput: 0, mcp: 0, patch: 0 },
        nonReasoning: 0,
      })
    }
    return perSession.get(id)!
  }

  for (const p of parts) {
    const cat = categoryChars(p)
    const acc = accFor(p.sessionId)
    for (const [k, v] of Object.entries(cat)) {
      if (v === 0) continue
      acc.content[k as keyof typeof cat] += v
      if (k !== "reasoning") acc.nonReasoning += v
    }
  }

  const rows = Array.from(perSession.entries())
    .map(([id, acc]) => {
      const s = sessions.get(id)
      const categories: Record<CompositionCategory, number> = {
        user: Math.round(acc.content.user / 4),
        assistant: Math.round(acc.content.assistant / 4),
        reasoning: Math.round(acc.content.reasoning / 4),
        toolInput: Math.round(acc.content.toolInput / 4),
        toolOutput: Math.round(acc.content.toolOutput / 4),
        mcp: Math.round(acc.content.mcp / 4),
        patch: Math.round(acc.content.patch / 4),
        scaffold: s ? Math.max(s.tokensInput - Math.round(acc.nonReasoning / 4), 0) : 0,
      }
      const total = Object.values(categories).reduce((a, b) => a + b, 0)
      return {
        id,
        title: s?.title ?? "",
        project: projectShortName(s?.directory ?? ""),
        agent: s?.agent ?? "default",
        cost: s?.cost ?? 0,
        categories,
        total,
      }
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)

  return { sessions: rows }
}

export function cacheRate(cacheRead: number, input: number): number {
  const total = cacheRead + input
  return total > 0 ? cacheRead / total : 0
}

export function getOverview(db: Database.Database) {
  const row = db
    .prepare(
      `SELECT COUNT(*) sessions, MIN(time_created) first_seen, MAX(time_created) last_seen,
        SUM(tokens_input) tokens_input, SUM(tokens_output) tokens_output,
        SUM(tokens_reasoning) tokens_reasoning, SUM(tokens_cache_read) tokens_cache_read,
        SUM(tokens_cache_write) tokens_cache_write, ROUND(SUM(cost), 4) cost
       FROM session`,
    )
    .get() as Row
  const tokensInput = Number(row.tokens_input ?? 0)
  const tokensOutput = Number(row.tokens_output ?? 0)
  const cacheRead = Number(row.tokens_cache_read ?? 0)
  return {
    sessions: Number(row.sessions),
    firstSeen: Number(row.first_seen),
    lastSeen: Number(row.last_seen),
    tokens: {
      input: tokensInput,
      output: tokensOutput,
      reasoning: Number(row.tokens_reasoning ?? 0),
      cacheRead,
      cacheWrite: Number(row.tokens_cache_write ?? 0),
    },
    cacheHitRate: cacheRate(cacheRead, tokensInput),
    cost: Number(row.cost ?? 0),
  }
}

export function getTimeseries(db: Database.Database, granularity: "day" | "week") {
  const bucket =
    granularity === "week"
      ? `strftime('%Y-W%W', time_created/1000, 'unixepoch', 'localtime')`
      : `date(time_created/1000, 'unixepoch', 'localtime')`
  const rows = db
    .prepare(
      `SELECT ${bucket} as bucket, COUNT(*) sessions, SUM(tokens_input) tokens_input,
        SUM(tokens_output) tokens_output, SUM(tokens_reasoning) tokens_reasoning,
        SUM(tokens_cache_read) tokens_cache_read, ROUND(SUM(cost), 4) cost
       FROM session GROUP BY bucket ORDER BY bucket`,
    )
    .all() as Row[]
  return rows.map((r) => ({
    bucket: String(r.bucket),
    sessions: Number(r.sessions),
    tokensInput: Number(r.tokens_input ?? 0),
    tokensOutput: Number(r.tokens_output ?? 0),
    tokensReasoning: Number(r.tokens_reasoning ?? 0),
    tokensCacheRead: Number(r.tokens_cache_read ?? 0),
    cost: Number(r.cost ?? 0),
  }))
}

function projectShortName(directory: string): string {
  const parts = path.normalize(directory).split(path.sep).filter(Boolean)
  return parts.slice(-2).join("/") || directory
}

export function getBreakdown(db: Database.Database, by: "model" | "agent" | "project") {
  const group =
    by === "model"
      ? `json_extract(model, '$.id')`
      : by === "agent"
        ? `CASE WHEN agent IS NULL OR agent = '' THEN 'default' ELSE agent END`
        : `directory`
  const rows = db
    .prepare(
      `SELECT ${group} as key, COUNT(*) sessions, SUM(tokens_input) tokens_input,
        SUM(tokens_output) tokens_output, SUM(tokens_reasoning) tokens_reasoning,
        SUM(tokens_cache_read) tokens_cache_read, ROUND(SUM(cost), 4) cost
       FROM session GROUP BY key ORDER BY cost DESC`,
    )
    .all() as Row[]
  return rows
    .filter((r) => r.key !== null && String(r.key) !== "")
    .map((r) => {
      const key = String(r.key)
      const tokensInput = Number(r.tokens_input ?? 0)
      const cacheRead = Number(r.tokens_cache_read ?? 0)
      return {
        key: by === "project" ? projectShortName(key) : key,
        sessions: Number(r.sessions),
        tokensInput,
        tokensOutput: Number(r.tokens_output ?? 0),
        tokensReasoning: Number(r.tokens_reasoning ?? 0),
        tokensCacheRead: cacheRead,
        cost: Number(r.cost ?? 0),
        cacheHitRate: cacheRate(cacheRead, tokensInput),
      }
    })
}

function withToolStats(select: string, where: string, orderBy: string, limit: number, offset: number) {
  return `SELECT ${select}, 
      (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) messages,
      (SELECT COUNT(*) FROM part p WHERE p.session_id = s.id AND json_extract(p.data, '$.type') = 'tool') tool_calls,
      (SELECT COUNT(*) FROM part p WHERE p.session_id = s.id AND json_extract(p.data, '$.type') = 'tool' AND json_extract(p.data, '$.state.status') = 'error') errors,
      (SELECT COALESCE(SUM(length(json_extract(p.data, '$.state.output'))), 0) FROM part p WHERE p.session_id = s.id AND json_extract(p.data, '$.type') = 'tool') tool_output_chars
    FROM session s
    ${where}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}`
}

const SESSION_WHERE = { where: "", orderBy: "s.time_created DESC" }

export function getSessions(
  db: Database.Database,
  opts: { limit?: number; offset?: number; sort?: string; dir?: string },
) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
  const offset = Math.max(opts.offset ?? 0, 0)
  const sort = opts.sort ?? "time"
  const dir = opts.dir === "asc" ? "ASC" : "DESC"
  const orderBy =
    sort === "cost" ? `s.cost ${dir}`
    : sort === "tokens" ? `(s.tokens_input + s.tokens_output) ${dir}`
    : sort === "duration" ? `(s.time_updated - s.time_created) ${dir}`
    : `s.time_created ${dir}`
  const sql = withToolStats(SESSION_COLS, SESSION_WHERE.where, orderBy, limit, offset)
  const rows = db.prepare(sql).all() as Row[]
  const total = (db.prepare(`SELECT COUNT(*) n FROM session`).get() as Row).n as number
  return {
    total,
    sessions: rows.map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      directory: String(r.directory ?? ""),
      project: projectShortName(String(r.directory ?? "")),
      agent: String(r.agent ?? "default"),
      model: String(r.model ?? ""),
      timeCreated: Number(r.time_created),
      timeUpdated: Number(r.time_updated ?? 0),
      tokens: {
        input: Number(r.tokens_input ?? 0),
        output: Number(r.tokens_output ?? 0),
        reasoning: Number(r.tokens_reasoning ?? 0),
        cacheRead: Number(r.tokens_cache_read ?? 0),
        cacheWrite: Number(r.tokens_cache_write ?? 0),
      },
      cost: Number(r.cost ?? 0),
      messages: Number(r.messages),
      toolCalls: Number(r.tool_calls),
      errors: Number(r.errors),
      toolOutputChars: Number(r.tool_output_chars),
    })),
  }
}

export function getSessionDetail(db: Database.Database, id: string) {
  const session = db
    .prepare(
      `SELECT ${SESSION_COLS.replaceAll("s.", "")} FROM session WHERE id = ?`,
    )
    .get(id) as Row | undefined
  if (!session) return null

  const messages = db
    .prepare(
      `SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created, id`,
    )
    .all(id) as Row[]
  const parts = db
    .prepare(
      `SELECT message_id, data FROM part WHERE session_id = ? ORDER BY time_created, id`,
    )
    .all(id) as Row[]

  const partsByMessage = new Map<
    string,
    Array<{ type: string; tool?: string; state?: string; outputChars: number }>
  >()
  const msgChars = new Map<string, Record<Exclude<CompositionCategory, "scaffold">, number>>()
  const roleById = new Map<string, string>()
  for (const m of messages) {
    let role = "assistant"
    try {
      role = (JSON.parse(String(m.data)) as { role?: string }).role ?? "assistant"
    } catch {
      /* keep default */
    }
    roleById.set(String(m.id), role)
  }
  for (const p of parts) {
    const mid = String(p.message_id)
    let parsed: unknown
    try {
      parsed = JSON.parse(String(p.data))
    } catch {
      continue
    }
    const d = parsed as Record<string, unknown>
    const type = String(d.type ?? "")
    const state = (d.state as Record<string, unknown> | undefined)?.status as string | undefined
    const tool = typeof d.tool === "string" ? d.tool : undefined
    const outputChars =
      typeof (d.state as Record<string, unknown> | undefined)?.output === "string"
        ? ((d.state as Record<string, unknown>).output as string).length
        : 0
    const entry = { type, tool, state, outputChars }
    const arr = partsByMessage.get(mid)
    if (arr) arr.push(entry)
    else partsByMessage.set(mid, [entry])

    const tin =
      typeof (d.state as Record<string, unknown> | undefined)?.input === "string"
        ? ((d.state as Record<string, unknown>).input as string).length
        : 0
    const txt = typeof d.text === "string" ? (d.text as string).length : 0
    const patch = type === "patch" && typeof d.patch === "string" ? (d.patch as string).length : 0
    const mcp = type === "tool" && !!tool && isMcpTool(tool)
    const isUser = roleById.get(mid) === "user"
    const cats = msgChars.get(mid) ?? {
      user: 0, assistant: 0, reasoning: 0, toolInput: 0, toolOutput: 0, mcp: 0, patch: 0,
    }
    if (type === "text" && isUser) cats.user += txt
    if (type === "text" && !isUser) cats.assistant += txt
    if (type === "reasoning") cats.reasoning += txt
    if (type === "tool" && !mcp) cats.toolInput += tin
    if (type === "tool" && !mcp) cats.toolOutput += outputChars
    if (mcp) cats.mcp += tin + outputChars
    if (type === "patch") cats.patch += patch
    msgChars.set(mid, cats)
  }

  const messageList = messages.map((m) => {
    const role = roleById.get(String(m.id)) ?? "assistant"
    const chars = msgChars.get(String(m.id)) ?? {
      user: 0, assistant: 0, reasoning: 0, toolInput: 0, toolOutput: 0, mcp: 0, patch: 0,
    }
    const categories: Record<Exclude<CompositionCategory, "scaffold">, number> = Object.fromEntries(
      Object.entries(chars).map(([k, v]) => [k, Math.round((v as number) / 4)]),
    ) as Record<Exclude<CompositionCategory, "scaffold">, number>
    const estTokens = Object.values(categories).reduce((a, b) => a + b, 0)
    return {
      id: String(m.id),
      timeCreated: Number(m.time_created),
      role,
      estTokens,
      categories,
      parts: partsByMessage.get(String(m.id)) ?? [],
    }
  })

  const nonReasoningEstTokens = messageList.reduce(
    (acc, m) => acc + m.estTokens - m.categories.reasoning,
    0,
  )
  const scaffold = Math.max(Number(session.tokens_input) - nonReasoningEstTokens, 0)
  const composition = messageList.reduce<Record<CompositionCategory, number>>(
    (acc, m) => {
      for (const k of COMPOSITION_CATEGORIES) {
        if (k === "scaffold") continue
        acc[k] += (m.categories as Record<string, number>)[k] ?? 0
      }
      return acc
    },
    { user: 0, assistant: 0, reasoning: 0, toolInput: 0, toolOutput: 0, mcp: 0, patch: 0, scaffold },
  )
  composition.scaffold = scaffold

  return {
    id: String(session.id),
    title: String(session.title ?? ""),
    directory: String(session.directory ?? ""),
    agent: String(session.agent ?? "default"),
    model: String(session.model ?? ""),
    timeCreated: Number(session.time_created),
    timeUpdated: Number(session.time_updated),
    tokens: {
      input: Number(session.tokens_input ?? 0),
      output: Number(session.tokens_output ?? 0),
      reasoning: Number(session.tokens_reasoning ?? 0),
      cacheRead: Number(session.tokens_cache_read ?? 0),
      cacheWrite: Number(session.tokens_cache_write ?? 0),
    },
    cost: Number(session.cost ?? 0),
    composition,
    scaffoldEstTokens: scaffold,
    contentEstTokens: nonReasoningEstTokens,
    messages: messageList,
  }
}

export function getWaste(db: Database.Database) {
  const overview = getOverview(db)

  const zeroOutput = (db
    .prepare(`SELECT COUNT(*) n FROM session WHERE tokens_output = 0 AND tokens_input > 10000`)
    .get() as Row).n as number

  const lowCacheHit = db
    .prepare(
      `SELECT ${SESSION_COLS},
        (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) messages,
        (SELECT COUNT(*) FROM part p WHERE p.session_id = s.id AND json_extract(p.data, '$.type') = 'tool') tool_calls
       FROM session s
       WHERE s.tokens_input > 100000 AND s.tokens_cache_read * 1.0 / (s.tokens_cache_read + s.tokens_input) < 0.5
       ORDER BY s.tokens_input DESC LIMIT 10`,
    )
    .all() as Row[]

  const topToolOutput = db
    .prepare(
      `SELECT json_extract(data, '$.tool') as tool, COUNT(*) calls, SUM(length(json_extract(data, '$.state.output'))) output_chars
       FROM part WHERE json_extract(data, '$.type') = 'tool' AND json_extract(data, '$.state.output') IS NOT NULL
       GROUP BY tool ORDER BY output_chars DESC LIMIT 10`,
    )
    .all() as Row[]

  const fatSessions = db
    .prepare(
      `SELECT ${SESSION_COLS},
        (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) messages,
        (SELECT COUNT(*) FROM part p WHERE p.session_id = s.id AND json_extract(p.data, '$.type') = 'tool') tool_calls
       FROM session s
       WHERE s.tokens_input > 500000 AND (s.tokens_input + s.tokens_output) > 0
       ORDER BY (s.tokens_input * 1.0 / (s.tokens_input + s.tokens_output)) DESC LIMIT 10`,
    )
    .all() as Row[]

  const expensiveSessions = db
    .prepare(
      `SELECT ${SESSION_COLS},
        (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) messages,
        (SELECT COUNT(*) FROM part p WHERE p.session_id = s.id AND json_extract(p.data, '$.type') = 'tool') tool_calls
       FROM session s ORDER BY s.cost DESC LIMIT 10`,
    )
    .all() as Row[]

  const byAgent = db
    .prepare(
      `SELECT CASE WHEN agent IS NULL OR agent = '' THEN 'default' ELSE agent END agent,
        COUNT(*) sessions, SUM(tokens_input) tokens_input, SUM(tokens_output) tokens_output,
        SUM(tokens_reasoning) tokens_reasoning, SUM(tokens_cache_read) tokens_cache_read,
        SUM(tokens_cache_write) tokens_cache_write, ROUND(SUM(cost), 4) cost
       FROM session GROUP BY agent ORDER BY cost DESC`,
    )
    .all() as Row[]

  const toolOutputChars = Number(
    (db
      .prepare(
        `SELECT SUM(length(json_extract(data, '$.state.output'))) v FROM part
         WHERE json_extract(data, '$.type') = 'tool' AND json_extract(data, '$.state.output') IS NOT NULL`,
      )
      .get() as Row).v ?? 0,
  )

  const mapSession = (r: Row) => {
    const input = Number(r.tokens_input ?? 0)
    const output = Number(r.tokens_output ?? 0)
    const cacheRead = Number(r.tokens_cache_read ?? 0)
    return {
      id: String(r.id),
      title: String(r.title ?? ""),
      project: projectShortName(String(r.directory ?? "")),
      agent: String(r.agent ?? "default"),
      timeCreated: Number(r.time_created),
      tokensInput: input,
      tokensOutput: output,
      tokensCacheRead: cacheRead,
      cacheHitRate: cacheRate(cacheRead, input),
      cost: Number(r.cost ?? 0),
      messages: Number(r.messages ?? 0),
      toolCalls: Number(r.tool_calls ?? 0),
    }
  }

  return {
    cache: {
      hitRate: overview.cacheHitRate,
      cacheRead: overview.tokens.cacheRead,
      input: overview.tokens.input,
    },
    toolOutput: {
      totalChars: toolOutputChars,
      estTokens: Math.round(toolOutputChars / 4),
      byTool: topToolOutput.map((r) => ({
        tool: String(r.tool ?? "unknown"),
        calls: Number(r.calls),
        outputChars: Number(r.output_chars ?? 0),
      })),
    },
    zeroOutputSessions: zeroOutput,
    lowCacheHitSessions: lowCacheHit.map(mapSession),
    fatSessions: fatSessions.map(mapSession),
    expensiveSessions: expensiveSessions.map(mapSession),
    byAgent: byAgent.map((r) => {
      const input = Number(r.tokens_input ?? 0)
      const cacheRead = Number(r.tokens_cache_read ?? 0)
      const output = Number(r.tokens_output ?? 0)
      return {
        agent: String(r.agent),
        sessions: Number(r.sessions),
        tokensInput: input,
        tokensOutput: output,
        cacheRead,
        cost: Number(r.cost ?? 0),
        cacheHitRate: cacheRate(cacheRead, input),
        avgTokensPerSession: Math.round((input + output) / Math.max(Number(r.sessions), 1)),
      }
    }),
  }
}

export function getAnalyzeContext(db: Database.Database) {
  const overview = getOverview(db)
  const waste = getWaste(db)
  const byModel = getBreakdown(db, "model")
  const byAgent = getBreakdown(db, "agent")
  const byProject = getBreakdown(db, "project")
  const recent = getSessions(db, { limit: 15, sort: "time" })
  const composition = getComposition(db)
  return {
    overview,
    waste,
    byModel,
    byAgent,
    byProject,
    composition,
    recentSessions: recent.sessions,
  }
}
