import { mkdirSync } from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { config } from "./config.js"

export function openDb(): Database.Database {
  const db = new Database(config.dbPath, { readonly: true, fileMustExist: true })
  db.pragma("query_only = true")
  db.pragma("temp_store = memory")
  return db
}

const ANALYSIS_SCHEMA = `
CREATE TABLE IF NOT EXISTS analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  focus TEXT NOT NULL DEFAULT '',
  output TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'opencode',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analysis_created_at ON analysis(created_at DESC);
`

export interface AnalysisRow {
  id: number
  focus: string
  output: string
  model: string
  source: string
  created_at: number
}

export interface AnalysisSummary {
  id: number
  focus: string
  created_at: number
  output_len: number
}

export function openAnalysisDb(): Database.Database {
  mkdirSync(path.dirname(config.analysisDbPath), { recursive: true })
  const db = new Database(config.analysisDbPath)
  db.pragma("journal_mode = WAL")
  db.pragma("synchronous = NORMAL")
  db.exec(ANALYSIS_SCHEMA)
  return db
}

export function insertAnalysis(
  db: Database.Database,
  row: Omit<AnalysisRow, "id">,
): number {
  const info = db
    .prepare(
      "INSERT INTO analysis (focus, output, model, source, created_at) VALUES (@focus, @output, @model, @source, @created_at)",
    )
    .run(row)
  return Number(info.lastInsertRowid)
}

export function listAnalyses(db: Database.Database): AnalysisSummary[] {
  return db
    .prepare(
      "SELECT id, focus, created_at, LENGTH(output) AS output_len FROM analysis ORDER BY created_at DESC, id DESC LIMIT 100",
    )
    .all() as unknown as AnalysisSummary[]
}

export function getAnalysis(db: Database.Database, id: number): AnalysisRow | undefined {
  return db
    .prepare("SELECT id, focus, output, model, source, created_at FROM analysis WHERE id = ?")
    .get(id) as unknown as AnalysisRow | undefined
}

export function deleteAnalysis(db: Database.Database, id: number): boolean {
  return db.prepare("DELETE FROM analysis WHERE id = ?").run(id).changes > 0
}
