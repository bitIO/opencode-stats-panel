import fs from "node:fs"
import path from "node:path"
import express from "express"
import { openDb, openAnalysisDb, listAnalyses, getAnalysis, deleteAnalysis } from "./db.js"
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
  getProjects,
} from "./queries.js"

function projectOf(req: { query: { project?: unknown } }): string | null {
  const p = req.query.project
  return typeof p === "string" && p !== "" ? p : null
}

const app = express()
app.use(express.json())

const distDir = path.join(import.meta.dirname, "..", "dist")
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
      res.sendFile(path.join(distDir, "index.html"))
    } else {
      next()
    }
  })
}

let db = openDb()
const analysisDb = openAnalysisDb()

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, dbPath: config.dbPath })
})

app.get("/api/overview", (req, res) => {
  res.json(getOverview(db, projectOf(req)))
})

app.get("/api/timeseries", (req, res) => {
  const granularity = req.query.granularity === "week" ? "week" : "day"
  res.json(getTimeseries(db, granularity, projectOf(req)))
})

app.get("/api/breakdown", (req, res) => {
  const by = req.query.by === "agent" || req.query.by === "project" ? req.query.by : "model"
  res.json(getBreakdown(db, by, projectOf(req)))
})

app.get("/api/waste", (req, res) => {
  res.json(getWaste(db, projectOf(req)))
})

app.get("/api/composition", (req, res) => {
  res.json(getComposition(db, projectOf(req)))
})

app.get("/api/composition/sessions", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 12
  res.json(getSessionCompositions(db, limit, projectOf(req)))
})

app.get("/api/projects", (_req, res) => {
  res.json(getProjects(db))
})

app.get("/api/sessions", (req, res) => {
  const sort = typeof req.query.sort === "string" ? req.query.sort : "time"
  const dir = typeof req.query.dir === "string" ? req.query.dir : "desc"
  const limit = req.query.limit ? Number(req.query.limit) : 100
  const offset = req.query.offset ? Number(req.query.offset) : 0
  res.json(getSessions(db, { limit, offset, sort, dir }, projectOf(req)))
})

app.get("/api/sessions/:id", (req, res) => {
  const detail = getSessionDetail(db, req.params.id)
  if (!detail) {
    res.status(404).json({ error: "session not found" })
    return
  }
  res.json(detail)
})

app.get("/api/analysis", (_req, res) => {
  res.json(listAnalyses(analysisDb))
})

app.get("/api/analysis/:id", (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" })
    return
  }
  const row = getAnalysis(analysisDb, id)
  if (!row) {
    res.status(404).json({ error: "analysis not found" })
    return
  }
  res.json(row)
})

app.delete("/api/analysis/:id", (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" })
    return
  }
  if (!deleteAnalysis(analysisDb, id)) {
    res.status(404).json({ error: "analysis not found" })
    return
  }
  res.json({ ok: true })
})

app.post("/api/analyze", async (req, res) => {
  const project =
    typeof req.body?.project === "string" && req.body.project !== "" ? req.body.project : null
  const context = getAnalyzeContext(db, project)
  const focus = typeof req.body?.focus === "string" ? req.body.focus : undefined
  await streamAnalyze(res, context, focus, analysisDb)
})

app.listen(config.port, () => {
  console.log(`opencode-stats server on http://localhost:${config.port}`)
})
