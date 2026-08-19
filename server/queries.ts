import path from "node:path"
import os from "node:os"
import type Database from "better-sqlite3"

type Row = Record<string, unknown>

const SESSION_COLS = `s.id, s.title, s.directory, s.agent, s.model, s.tokens_input,
  s.tokens_output, s.tokens_reasoning, s.tokens_cache_read, s.tokens_cache_write,
  s.cost, s.time_created, s.time_updated`

export function projectWhere(project?: string | null): { sql: string; params: string[] } {
  if (!project) return { sql: "", params: [] }
  return { sql: "directory = ?", params: [project] }
}

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
  FROM part p JOIN message m ON m.id = p.message_id
  JOIN session s ON s.id = m.session_id`

function loadPartCounts(db: Database.Database, project?: string | null): PartCount[] {
  const { sql, params } = projectWhere(project)
  const where = sql ? ` WHERE ${sql}` : ""
  return (db.prepare(`${PART_ROWS_SQL}${where}`).all(...params) as Row[]).map((r) => ({
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

export function getComposition(db: Database.Database, project?: string | null) {
  const parts = loadPartCounts(db, project)
  const { sql, params } = projectWhere(project)
  const sessions = new Map(
    (db
      .prepare(
        `SELECT id, agent, model, tokens_input FROM session${sql ? ` WHERE ${sql}` : ""}`,
      )
      .all(...params) as Row[]).map((r) => [
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

export function getSessionCompositions(db: Database.Database, limit = 12, project?: string | null) {
  const parts = loadPartCounts(db, project)
  const { sql, params } = projectWhere(project)
  const sessions = new Map(
    (db
      .prepare(
        `SELECT id, title, directory, agent, tokens_input, cost FROM session${sql ? ` WHERE ${sql}` : ""}`,
      )
      .all(...params) as Row[]).map((r) => [
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

export function getOverview(db: Database.Database, project?: string | null) {
  const { sql, params } = projectWhere(project)
  const row = db
    .prepare(
      `SELECT COUNT(*) sessions, MIN(time_created) first_seen, MAX(time_created) last_seen,
        SUM(tokens_input) tokens_input, SUM(tokens_output) tokens_output,
        SUM(tokens_reasoning) tokens_reasoning, SUM(tokens_cache_read) tokens_cache_read,
        SUM(tokens_cache_write) tokens_cache_write, ROUND(SUM(cost), 4) cost
       FROM session${sql ? ` WHERE ${sql}` : ""}`,
    )
    .get(...params) as Row
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

export function getTimeseries(db: Database.Database, granularity: "day" | "week", project?: string | null) {
  const bucket =
    granularity === "week"
      ? `strftime('%Y-W%W', time_created/1000, 'unixepoch', 'localtime')`
      : `date(time_created/1000, 'unixepoch', 'localtime')`
  const { sql, params } = projectWhere(project)
  const rows = db
    .prepare(
      `SELECT ${bucket} as bucket, COUNT(*) sessions, SUM(tokens_input) tokens_input,
        SUM(tokens_output) tokens_output, SUM(tokens_reasoning) tokens_reasoning,
        SUM(tokens_cache_read) tokens_cache_read, ROUND(SUM(cost), 4) cost
       FROM session${sql ? ` WHERE ${sql}` : ""} GROUP BY bucket ORDER BY bucket`,
    )
    .all(...params) as Row[]
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

export function getBreakdown(db: Database.Database, by: "model" | "agent" | "project", project?: string | null) {
  const group =
    by === "model"
      ? `json_extract(model, '$.id')`
      : by === "agent"
        ? `CASE WHEN agent IS NULL OR agent = '' THEN 'default' ELSE agent END`
        : `directory`
  const { sql, params } = projectWhere(project)
  const rows = db
    .prepare(
      `SELECT ${group} as key, COUNT(*) sessions, SUM(tokens_input) tokens_input,
        SUM(tokens_output) tokens_output, SUM(tokens_reasoning) tokens_reasoning,
        SUM(tokens_cache_read) tokens_cache_read, ROUND(SUM(cost), 4) cost
       FROM session${sql ? ` WHERE ${sql}` : ""} GROUP BY key ORDER BY cost DESC`,
    )
    .all(...params) as Row[]
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

export function getProjects(db: Database.Database) {
  const rows = db
    .prepare(`SELECT directory, COUNT(*) n FROM session GROUP BY directory ORDER BY n DESC`)
    .all() as Row[]
  return rows
    .filter((r) => r.directory !== null && String(r.directory) !== "")
    .map((r) => ({
      directory: String(r.directory),
      project: projectShortName(String(r.directory)),
      sessions: Number(r.n),
    }))
}

export function getSessions(
  db: Database.Database,
  opts: { limit?: number; offset?: number; sort?: string; dir?: string },
  project?: string | null,
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
  const { sql, params } = projectWhere(project)
  const where = sql ? `WHERE ${sql}` : ""
  const sqlText = withToolStats(SESSION_COLS, where, orderBy, limit, offset)
  const rows = db.prepare(sqlText).all(...params) as Row[]
  const total = (
    db.prepare(`SELECT COUNT(*) n FROM session${where ? ` ${where}` : ""}`).get(...params) as Row
  ).n as number
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

function partSkillName(data: Record<string, unknown>, tool: string | undefined): string | null {
  if (tool !== "skill") return null
  const input = (data.state as Record<string, unknown> | undefined)?.input as
    | Record<string, unknown>
    | undefined
  return typeof input?.name === "string" ? input.name : null
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
    Array<{ type: string; tool?: string; state?: string; outputChars: number; skillName: string | null }>
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
    const entry = { type, tool, state, outputChars, skillName: partSkillName(d, tool) }
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

export function getWaste(db: Database.Database, project?: string | null) {
  const overview = getOverview(db, project)
  const { sql, params } = projectWhere(project)
  const and = sql ? ` AND ${sql}` : ""
  const where = sql ? ` WHERE ${sql}` : ""

  const zeroOutput = (db
    .prepare(
      `SELECT COUNT(*) n FROM session WHERE tokens_output = 0 AND tokens_input > 10000${and}`,
    )
    .get(...params) as Row).n as number

  const lowCacheHit = db
    .prepare(
      `SELECT ${SESSION_COLS},
        (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) messages,
        (SELECT COUNT(*) FROM part p WHERE p.session_id = s.id AND json_extract(p.data, '$.type') = 'tool') tool_calls
       FROM session s
       WHERE s.tokens_input > 100000 AND s.tokens_cache_read * 1.0 / (s.tokens_cache_read + s.tokens_input) < 0.5${and}
       ORDER BY s.tokens_input DESC LIMIT 10`,
    )
    .all(...params) as Row[]

  const topToolOutput = db
    .prepare(
      `SELECT json_extract(p.data, '$.tool') as tool, COUNT(*) calls, SUM(length(json_extract(p.data, '$.state.output'))) output_chars
       FROM part p JOIN message m ON m.id = p.message_id JOIN session s ON s.id = m.session_id
       WHERE json_extract(p.data, '$.type') = 'tool' AND json_extract(p.data, '$.state.output') IS NOT NULL${and}
       GROUP BY tool ORDER BY output_chars DESC LIMIT 10`,
    )
    .all(...params) as Row[]

  const fatSessions = db
    .prepare(
      `SELECT ${SESSION_COLS},
        (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) messages,
        (SELECT COUNT(*) FROM part p WHERE p.session_id = s.id AND json_extract(p.data, '$.type') = 'tool') tool_calls
       FROM session s
       WHERE s.tokens_input > 500000 AND (s.tokens_input + s.tokens_output) > 0${and}
       ORDER BY (s.tokens_input * 1.0 / (s.tokens_input + s.tokens_output)) DESC LIMIT 10`,
    )
    .all(...params) as Row[]

  const expensiveSessions = db
    .prepare(
      `SELECT ${SESSION_COLS},
        (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) messages,
        (SELECT COUNT(*) FROM part p WHERE p.session_id = s.id AND json_extract(p.data, '$.type') = 'tool') tool_calls
       FROM session s${where} ORDER BY s.cost DESC LIMIT 10`,
    )
    .all(...params) as Row[]

  const byAgent = db
    .prepare(
      `SELECT CASE WHEN agent IS NULL OR agent = '' THEN 'default' ELSE agent END agent,
        COUNT(*) sessions, SUM(tokens_input) tokens_input, SUM(tokens_output) tokens_output,
        SUM(tokens_reasoning) tokens_reasoning, SUM(tokens_cache_read) tokens_cache_read,
        SUM(tokens_cache_write) tokens_cache_write, ROUND(SUM(cost), 4) cost
       FROM session${where} GROUP BY agent ORDER BY cost DESC`,
    )
    .all(...params) as Row[]

  const toolOutputChars = Number(
    (db
      .prepare(
        `SELECT SUM(length(json_extract(p.data, '$.state.output'))) v FROM part p
         JOIN message m ON m.id = p.message_id JOIN session s ON s.id = m.session_id
         WHERE json_extract(p.data, '$.type') = 'tool' AND json_extract(p.data, '$.state.output') IS NOT NULL${and}`,
      )
      .get(...params) as Row).v ?? 0,
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

export interface SkillsFilters {
  project?: string | null
  since?: number | null
  agent?: string | null
  granularity?: "day" | "week"
}

const GLOBAL_SKILL_DIRS = [
  path.join(os.homedir(), ".agents/skills"),
  path.join(os.homedir(), ".config/opencode/skills"),
]

function skillOrigin(dir: string | null): "built-in" | "project" | "global" | "unknown" {
  if (dir === null) return "unknown"
  if (dir === ".") return "built-in"
  if (GLOBAL_SKILL_DIRS.some((base) => dir === base || dir.startsWith(base + path.sep))) {
    return "global"
  }
  return "project"
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function getSkills(db: Database.Database, opts: SkillsFilters = {}) {
  const { project, since, agent, granularity = "day" } = opts
  const bucket =
    granularity === "week"
      ? `strftime('%Y-W%W', p.time_created/1000, 'unixepoch', 'localtime')`
      : `date(p.time_created/1000, 'unixepoch', 'localtime')`

  const conds = [
    `json_extract(p.data, '$.type') = 'tool'`,
    `json_extract(p.data, '$.tool') = 'skill'`,
  ]
  const params: unknown[] = []
  if (project) {
    conds.push("s.directory = ?")
    params.push(project)
  }
  if (since != null) {
    conds.push("s.time_created >= ?")
    params.push(since)
  }
  if (agent) {
    conds.push("COALESCE(s.agent, 'default') = ?")
    params.push(agent)
  }

  const rows = db
    .prepare(
      `SELECT p.session_id sessionId,
        json_extract(p.data, '$.state.input.name') skillName,
        json_extract(p.data, '$.state.status') status,
        json_extract(p.data, '$.state.metadata.dir') originDir,
        COALESCE(json_extract(p.data, '$.state.time.end'), p.time_created) lastUsed,
        s.title title,
        s.directory project,
        s.agent agent,
        s.cost cost,
        s.tokens_output tokensOutput,
        s.tokens_input tokensInput,
        s.time_created sessionCreated,
        ${bucket} bucket
       FROM part p
       JOIN message m ON m.id = p.message_id
       JOIN session s ON s.id = m.session_id
       WHERE ${conds.join(" AND ")}
       ORDER BY p.time_created, p.id`,
    )
    .all(...params) as Row[]

  interface SkillAcc {
    invocations: number
    errors: number
    sessions: Set<string>
    deadSessions: Set<string>
    sessionCosts: Map<string, number>
    lastUsed: number
    originDir: string | null
  }
  const skills = new Map<string, SkillAcc>()
  const buckets = new Map<string, { invocations: number; errors: number }>()
  const byProject = new Map<string, { invocations: number; skills: Set<string> }>()
  const byAgent = new Map<string, { invocations: number; skills: Set<string> }>()
  const sessionRows = new Map<
    string,
    { title: string; directory: string; agent: string; sessionCreated: number; names: string[]; seen: Set<string> }
  >()
  const sessionCosts = new Map<string, number>()

  const skillAcc = (name: string): SkillAcc => {
    if (!skills.has(name)) {
      skills.set(name, {
        invocations: 0,
        errors: 0,
        sessions: new Set(),
        deadSessions: new Set(),
        sessionCosts: new Map(),
        lastUsed: 0,
        originDir: null,
      })
    }
    return skills.get(name)!
  }
  const bucketAcc = (key: string) => {
    if (!buckets.has(key)) buckets.set(key, { invocations: 0, errors: 0 })
    return buckets.get(key)!
  }
  const groupAcc = (map: Map<string, { invocations: number; skills: Set<string> }>, key: string) => {
    if (!map.has(key)) map.set(key, { invocations: 0, skills: new Set() })
    return map.get(key)!
  }
  const sessionAcc = (id: string) => {
    if (!sessionRows.has(id)) {
      sessionRows.set(id, {
        title: "",
        directory: "",
        agent: "",
        sessionCreated: 0,
        names: [],
        seen: new Set(),
      })
    }
    return sessionRows.get(id)!
  }

  for (const r of rows) {
    const name = String(r.skillName ?? "unknown")
    const sessionId = String(r.sessionId)
    const isError = String(r.status ?? "") === "error"
    const cost = Number(r.cost ?? 0)
    const lastUsed = Number(r.lastUsed ?? r.sessionCreated ?? 0)
    const sessionCreated = Number(r.sessionCreated ?? 0)
    const dir = String(r.project ?? "")
    const sessAgent = String(r.agent ?? "default")
    const isDead = Number(r.tokensOutput ?? 0) === 0 && Number(r.tokensInput ?? 0) > 10000

    const acc = skillAcc(name)
    acc.invocations += 1
    if (isError) acc.errors += 1
    acc.sessions.add(sessionId)
    if (isDead) acc.deadSessions.add(sessionId)
    if (!acc.sessionCosts.has(sessionId)) acc.sessionCosts.set(sessionId, cost)
    if (lastUsed > acc.lastUsed) {
      acc.lastUsed = lastUsed
      acc.originDir = r.originDir === null || r.originDir === undefined ? null : String(r.originDir)
    }

    if (!sessionCosts.has(sessionId)) sessionCosts.set(sessionId, cost)

    const b = bucketAcc(String(r.bucket ?? ""))
    b.invocations += 1
    if (isError) b.errors += 1

    if (dir !== "") {
      const p = groupAcc(byProject, dir)
      p.invocations += 1
      p.skills.add(name)
    }
    const g = groupAcc(byAgent, sessAgent)
    g.invocations += 1
    g.skills.add(name)

    const s = sessionAcc(sessionId)
    s.title = String(r.title ?? "")
    s.directory = dir
    s.agent = sessAgent
    s.sessionCreated = sessionCreated
    if (!s.seen.has(name)) {
      s.seen.add(name)
      s.names.push(name)
    }
  }

  const totalSessions = sessionCosts.size
  const totalCost = round4(Array.from(sessionCosts.values()).reduce((a, b) => a + b, 0))

  return {
    totals: {
      invocations: rows.length,
      skills: skills.size,
      sessions: totalSessions,
      cost: totalCost,
      errorInvocations: Array.from(skills.values()).reduce((a, s) => a + s.errors, 0),
    },
    skills: Array.from(skills.entries())
      .map(([name, s]) => {
        const sessions = s.sessions.size
        const deadSessions = s.deadSessions.size
        const cost = round4(Array.from(s.sessionCosts.values()).reduce((a, b) => a + b, 0))
        return {
          name,
          origin: skillOrigin(s.originDir),
          invocations: s.invocations,
          errors: s.errors,
          errorRate: s.invocations > 0 ? round4(s.errors / s.invocations) : 0,
          sessions,
          deadSessions,
          deadSessionRate: sessions > 0 ? round4(deadSessions / sessions) : 0,
          reuse: totalSessions > 0 ? round4(sessions / totalSessions) : 0,
          cost,
          costPerSession: sessions > 0 ? round4(cost / sessions) : 0,
          lastUsed: s.lastUsed,
        }
      })
      .sort((a, b) => b.invocations - a.invocations || a.name.localeCompare(b.name)),
    timeseries: Array.from(buckets.entries())
      .map(([bucketKey, b]) => ({ bucket: bucketKey, invocations: b.invocations, errors: b.errors }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket)),
    byProject: Array.from(byProject.entries())
      .map(([projectName, g]) => ({ project: projectName, invocations: g.invocations, skills: g.skills.size }))
      .sort((a, b) => b.invocations - a.invocations || a.project.localeCompare(b.project)),
    byAgent: Array.from(byAgent.entries())
      .map(([agentName, g]) => ({ agent: agentName, invocations: g.invocations, skills: g.skills.size }))
      .sort((a, b) => b.invocations - a.invocations || a.agent.localeCompare(b.agent)),
    sessions: Array.from(sessionRows.entries())
      .sort((a, b) => b[1].sessionCreated - a[1].sessionCreated)
      .slice(0, 200)
      .map(([id, s]) => ({
        id,
        title: s.title,
        directory: s.directory,
        agent: s.agent,
        timeCreated: s.sessionCreated,
        skills: s.names,
      })),
  }
}

export function getAnalyzeContext(db: Database.Database, project?: string | null) {
  const overview = getOverview(db, project)
  const waste = getWaste(db, project)
  const byModel = getBreakdown(db, "model", project)
  const byAgent = getBreakdown(db, "agent", project)
  const byProject = getBreakdown(db, "project", project)
  const recent = getSessions(db, { limit: 15, sort: "time" }, project)
  const composition = getComposition(db, project)
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
