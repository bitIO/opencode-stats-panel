import { homedir } from "node:os"
import path from "node:path"

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.OPENCODE_DB ?? path.join(homedir(), ".local/share/opencode/opencode.db"),
  analysisDbPath:
    process.env.OPENCODE_STATS_DB ?? path.join(import.meta.dirname, "..", "data", "analysis.db"),
  analyzeModel: process.env.OPENCODE_STATS_MODEL ?? "opencode/big-pickle",
  analyzeTimeoutMs: 180_000,
}
