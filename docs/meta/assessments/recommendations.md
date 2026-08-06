# Recommendations — Prioritized Build Plan

Reuse-first plan to make loop-lore a credible ordinary agentic / business /
assistant platform. Ordered by leverage-to-effort. Each item notes the existing
module it reuses and the latest-analysis idea it satisfies.

## Principle

Ship agentic mode as a **thin extension**, not a fork. Reuse schema, generation,
plugins, crypto, multi-user, and frontend shells. Invest new code only in
**execution (sandbox + tools), grounding (RAG), and governance (audit + RBAC +
cost)**.

## Wave 0 — Schema flags (days, compile-only)

- Add `chats.mode` (`'rpg' | 'agentic'`), extend `messages.content_type`
  (`tool_call | tool_result | code | artifact`), `actors.agent_type`,
  `assets.asset_type` to enums.
- Apply `docs/meta/analysis/string-to-enum-migration.md` tightening for these fields.
- **Reuse:** `db/enums-*.ts`, Kysely `Generated<string>` (no migration SQL).
- **Satisfies:** foundation of agentic-workspace spec.

## Wave 1 — Low-effort business wins (1–2 sprints)

- **#6 regex output transforms** — structured tool-result parsing. Pure
  frontend; no backend. (Effort: Low)
- **#8 smart-regen** — reuse `/improve` command infra. (Low)
- **#18 template share** — reuse `export.md`. (Low)
- **#27 conversation analytics + #28 model-comparison** — per-agent cost/quality.
  Token counts + `model_comparisons` already specced. (Low)
- **Assistant copilot hardening** — promote `src/assistant/` to a usable
  single-agent mode behind `mode='agentic'`.

## Wave 2 — Execution substrate (the real gap, 2–3 sprints)

- **Tool registry + sandbox tiers** (Tier A/B/C from `agentic-workspace.md`).
  Reuse `plugins/` loader for community tools; `crypto/` for per-workspace
  scoping; `auth-middleware` for tool authorization.
- **Built-in tools:** `search`, `extract`, `run_code`/`run_shell` (Tier B),
  `http_request`/`mcp_call` (Tier C, egress allowlist), `query_sql`,
  `create_doc`/`edit_doc`.
- **Human-in-the-loop approval gate** before external-mutating tools.

## Wave 3 — Grounding (RAG) (2–3 sprints)

- **Embedding + retrieval adapter** plugged into `generation/` prompt stage.
  Borrow **Enterprise RAG** pattern; GraphRAG via `asset_links` for relational
  knowledge (#13).
- **#10 grounding guard** repurposed as fact-verification over retrieved
  context.
- **#12 cross-chat global memory** + **#13 knowledge-graph visualizer** as the
  memory surface.

## Wave 4 — Governance + scale (ongoing)

- **Audit sink** on `logger/` (who/what/when/result) — tamper-evident store.
- **Cost governance:** per-agent/user budgets; `maxTokens` caps.
- **RBAC/SSO + tenant isolation** on top of existing roles/sessions; PG dialect
  swap for multi-tenant.
- **#25 E2E sync**, **#24 mobile UX**, **#23 offline PWA** for field/edge
  deployment.
- **#19/#20 co-authoring + shared workspace** for team use.

## What to explicitly NOT build (borrow instead)

| Don't build            | Borrow                                                |
| ---------------------- | ----------------------------------------------------- |
| Custom RAG framework   | Enterprise RAG / GraphRAG adapters                    |
| Custom agent framework | Orchestration via existing `turning/` + `group-chat/` |
| Custom auth provider   | SSO bridge on `auth-middleware`                       |
| Custom observability   | Extend `logger/` + #27/#28                            |

## Success metrics (proposed)

- % of agent runs that are tool-assisted (not chat-only)
- Avg cost per agent task (tracked via #27)
- Grounding accuracy (% claims supported by retrieved context, via #10)
- Time-to-first-agent: from install to a working research/KB agent

_Reintegrate as: input to `.plan/roadmaps/roadmap.md` (new "Agentic / Business" track)
and `.plan/backlog/`._
