# opencode-stats-panel

Local dashboard for analyzing opencode usage — tokens, cost, cache efficiency, waste, and an AI-powered analyst on top.

## Stack

- **Frontend**: React 19 + Vite + TypeScript + shadcn/ui (dark, terminal-inspired)
- **Backend**: Express + better-sqlite3 (read-only access to opencode's live DB)
- **AI analysis**: shells out to `opencode run -m opencode/big-pickle` (Opencode Zen), streams the reply via SSE

## Features

- **Overview** — KPI cards (cost, tokens, cache hit rate, reasoning burn), token-volume time series, cost/agent/project breakdowns, recent sessions.
- **Composition** — what the context is actually made of: estimated token share by origin (user/assistant text, reasoning, tool calls, tool output, MCP calls, patches) plus the **scaffold** — the system prompt + tool schemas + MCP definitions re-sent every step (typically ~60% of context). Per-model/agent views and per-session stacked bars; the session drawer shows the same breakdown per message.
- **Waste & Insights** — tool-output bloat (read/bash re-feeding context), cache misses, fat-input/thin-output sessions, dead sessions, agent efficiency, most expensive sessions.
- **Sessions** — sortable/paginated table with a drill-down drawer (token mix, context composition, per-message breakdown, tool calls, errors).
- **AI Analysis** — big-pickle reads a live snapshot (now including context composition) and returns number-backed recommendations.

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts the API on `:8787` and Vite on `:5173` (API proxied under `/api`).

- `OPENCODE_DB=/path/to/opencode.db npm run dev` — point at a different DB (default `~/.local/share/opencode/opencode.db`).
- `OPENCODE_STATS_MODEL=opencode/claude-sonnet-4-6 npm run dev` — different analysis model.

## How it reads the DB

The backend opens the live opencode.db **read-only** (`query_only` pragma). SQLite's WAL mode allows concurrent readers, so opencode can keep writing while the dashboard reads. Every query is a fresh read, so numbers always reflect the latest sessions — hit refresh for new data.

## Notes

- `.bin/npm` is a shim that strips `--allow-scripts` (npm 12 rejects that flag in project installs, but the global `~/.npmrc` `allow-scripts` entry makes `npx shadcn` pass it). Run shadcn adds via `PATH="$PWD/.bin:$PATH" node node_modules/shadcn/dist/index.js add <component>`.
- The `shadcn`/`tailwindcss`/`better-sqlite3`/`fsevents` entries in `package.json#allowScripts` are npm 12's sanctioned way to permit those packages' install scripts.
