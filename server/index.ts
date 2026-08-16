import express from "express"
import { openDb } from "./db.js"
import { config } from "./config.js"
import { streamAnalyze } from "./analyze.js"
import {
  getOverview,
  getTimeseries,
  getBreakdown,
  getWaste,
  getSessions,
  getSessionDetail,
  getAnalyzeContext,
  getComposition,
  getSessionCompositions,
} from "./queries.js"

const app = express()
app.use(express.json())

let db = openDb()

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, dbPath: config.dbPath })
})

app.get("/api/overview", (_req, res) => {
  res.json(getOverview(db))
})

app.get("/api/timeseries", (req, res) => {
  const granularity = req.query.granularity === "week" ? "week" : "day"
  res.json(getTimeseries(db, granularity))
})

app.get("/api/breakdown", (req, res) => {
  const by = req.query.by === "agent" || req.query.by === "project" ? req.query.by : "model"
  res.json(getBreakdown(db, by))
})

app.get("/api/waste", (_req, res) => {
  res.json(getWaste(db))
})

app.get("/api/composition", (_req, res) => {
  res.json(getComposition(db))
})

app.get("/api/composition/sessions", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 12
  res.json(getSessionCompositions(db, limit))
})

app.get("/api/sessions", (req, res) => {
  const sort = typeof req.query.sort === "string" ? req.query.sort : "time"
  const dir = typeof req.query.dir === "string" ? req.query.dir : "desc"
  const limit = req.query.limit ? Number(req.query.limit) : 100
  const offset = req.query.offset ? Number(req.query.offset) : 0
  res.json(getSessions(db, { limit, offset, sort, dir }))
})

app.get("/api/sessions/:id", (req, res) => {
  const detail = getSessionDetail(db, req.params.id)
  if (!detail) {
    res.status(404).json({ error: "session not found" })
    return
  }
  res.json(detail)
})

app.post("/api/analyze", async (req, res) => {
  const context = getAnalyzeContext(db)
  const focus = typeof req.body?.focus === "string" ? req.body.focus : undefined
  await streamAnalyze(res, context, focus)
})

app.listen(config.port, () => {
  console.log(`opencode-stats server on http://localhost:${config.port}`)
})
