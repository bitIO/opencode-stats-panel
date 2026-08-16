import Database from "better-sqlite3"
import { config } from "./config.js"

export function openDb(): Database.Database {
  const db = new Database(config.dbPath, { readonly: true, fileMustExist: true })
  db.pragma("query_only = true")
  db.pragma("temp_store = memory")
  return db
}
