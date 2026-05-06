# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

Text2SQL is an AI-powered database design assistant (Chinese UI). Users describe business requirements in natural language, and the app generates a complete database design: requirement refinement, key point extraction, table schema design, SQL DDL statements, and a design document — along with an interactive ER diagram.

The LLM provider is user-configurable (OpenAI, DeepSeek, Anthropic-compatible, Moonshot, Zhipu, or any OpenAI-compatible endpoint). Configuration is stored in SQLite via Prisma.

## Commands

```bash
# Development (runs prisma generate + db push + next dev on port 3000)
pnpm dev

# Lint (ESLint – all rules are currently off, so this is a no-op in practice)
pnpm lint

# Build (standalone output mode, copies static assets into .next/standalone/)
pnpm build

# Production start
pnpm start

# Database operations
pnpm db:push    # prisma db push
pnpm db:generate # prisma generate
pnpm db:migrate  # prisma migrate dev
pnpm db:reset    # prisma migrate reset
```

## Architecture

**Single-page app** (`src/app/page.tsx`): left panel (textarea for requirements) → right panel (tabs for results). All state lives in component state (React useState) — no global state manager is wired up despite Zustand being a dependency.

**Backend pipeline** (`src/app/api/analyze/route.ts`): The `/api/analyze` POST endpoint runs a sequential 5-stage LLM pipeline via **Server-Sent Events (SSE)**. The client reads the stream progressively and updates the UI per stage:

| Stage | Purpose | LLM Output |
|---|---|---|
| `optimization` | Refine/extract business requirements from user input | Plain text |
| `analysis` | Extract key functional points from refined requirements | JSON `{ keyPoints: string[] }` |
| `design` | Design table schemas and relationships | JSON `{ tables: TableSchema[], relations: TableRelation[] }` |
| `sql_generation` | Generate DDL SQL for the configured database dialect | Plain SQL text |
| `doc_generation` | Generate a structured Markdown design document | Markdown text |

Each stage has its own timeout budget. The entire pipeline has a 300-second total budget (`ANALYZE_TOTAL_BUDGET_MS`). Heartbeat events are sent every 12s to keep the SSE connection alive. On failure, the pipeline can fall back from streaming to non-streaming LLM calls and retry JSON self-repair via a secondary LLM call.

**Database** (SQLite via Prisma, schema at `prisma/schema.prisma`):
- `LLMConfig` — stores provider credentials, model settings, and target database dialect (multi-config support with one active at a time)
- `History` — caches successful analysis results; requests with identical requirements + same db type reuse cache within 24 hours

**Other API routes:**
- `GET/PUT/DELETE /api/llm-config` — read/write LLM configuration (multi-config, transactional upsert)
- `GET/DELETE /api/history` — list or delete analysis history records

**ER Diagram** (`src/components/er-diagram.tsx`): Pure SVG rendering with layout computed in `useMemo`. No external diagram library. Supports PNG export via `html-to-image`.

**UI components** (`src/components/ui/`): Full Shadcn UI library. `components.json` is present for `shadcn add` usage.

## Key Technical Details

- **Next.js 16** with App Router, standalone output mode, React 19
- **Tailwind CSS v4** (configured via `@tailwindcss/postcss`)
- **ESLint**: All rules are explicitly turned off in `eslint.config.mjs` — linting is effectively disabled
- **LLM calls**: The backend uses raw `fetch` against OpenAI-compatible `/v1/chat/completions` endpoints with `stream: true` (SSE). It parses the stream manually, not via the OpenAI SDK
- **JSON parsing resilience**: The analyze route includes aggressive JSON repair logic (`extractBalancedJsonObject`, `aggressiveJsonFix`, LLM-based self-repair) because LLMs frequently return malformed JSON
- **Chinese language**: All prompts, UI text, and error messages are in Chinese
- **Prisma client singleton**: `src/lib/db.ts` uses the standard Next.js global Prisma client pattern to avoid connection exhaustion in dev
- The `Database syntax guides` in the analyze route contain dialect-specific DDL instructions for 7 database types (MySQL, PostgreSQL, SQLite, SQL Server, Oracle, MariaDB, ClickHouse)
