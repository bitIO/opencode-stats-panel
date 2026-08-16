import { spawn } from "node:child_process"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Response } from "express"
import { config } from "./config.js"
import type { getAnalyzeContext } from "./queries.js"

type Context = ReturnType<typeof getAnalyzeContext>

const ANSI = /\u001b\[[0-9;]*[a-zA-Z]/g
// warp terminal notification sequences emitted by the opencode CLI wrapper
const WARP = /\u001b\]777;[^\u0007]*\u0007/g

function buildPrompt(context: Context, focus?: string): { message: string; filePath: string } {
  const message = [
    "You are an expert analyst for opencode (an AI coding agent).",
    "A JSON file is attached containing aggregated usage analytics: totals, cache efficiency, token/cost waste indicators, tool output sizes, breakdowns by model/agent/project, context composition (scaffold = system prompt + tool schemas + MCP definitions, reasoning, tool calls/outputs, MCP calls), and a list of the most recent sessions.",
    "Task: analyze the data and produce actionable insights.",
    "Focus on: where tokens and money are being wasted (cache misses, oversized tool outputs, scaffold overhead from system prompts and MCP definitions, high-reasoning/low-output sessions, expensive agents/models), patterns to improve (which model/agent to use where, how to shrink MCP/tool-schema bloat), and anomalies worth investigating.",
    "Be concrete and reference the actual numbers in the data. Use markdown with short sections and bullet points.",
  ]
  if (focus) message.push(`The user specifically wants insight about: ${focus}`)
  return { message: message.join(" "), filePath: "" }
}

async function writeSnapshot(context: Context): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "opencode-stats-"))
  const file = path.join(dir, "usage.json")
  await writeFile(file, JSON.stringify(context, null, 2))
  return file
}

export async function streamAnalyze(
  res: Response,
  context: Context,
  focus?: string,
): Promise<void> {
  const file = await writeSnapshot(context)
  const { message } = buildPrompt(context, focus)

  const args = ["run", "-m", config.analyzeModel, "-f", file, "--format", "default", message]
  const child = spawn("opencode", args, { stdio: ["ignore", "pipe", "pipe"] })

  const timer = setTimeout(() => {
    child.kill("SIGKILL")
  }, config.analyzeTimeoutMs)

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  })

  let buffer = ""
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString().replace(WARP, "")
    // strip ANSI and emit as SSE chunks
    const cleaned = buffer.replace(ANSI, "")
    if (cleaned.length > 0) {
      res.write(`data: ${JSON.stringify({ text: cleaned })}\n\n`)
      buffer = ""
    }
  })

  child.stderr.on("data", (chunk: Buffer) => {
    const msg = chunk.toString().replace(ANSI, "").trim()
    if (msg) res.write(`data: ${JSON.stringify({ log: msg })}\n\n`)
  })

  child.on("error", (err) => {
    clearTimeout(timer)
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  })

  child.on("close", (code) => {
    clearTimeout(timer)
    res.write(`data: ${JSON.stringify({ done: true, code })}\n\n`)
    res.end()
  })
}
