# Platform Fit — What Already Maps to Agentic / Business Use

Inventory of loop-lore modules that directly serve ordinary (non-RPG) workloads.
Goal: prove how much is reusable before proposing new build.

## Generic primitives already present

| Module (`src/`)                                             | Spec                                        | Agentic / Business mapping                                               |
| ----------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `db/` (Kysely, `bun:sqlite`→PG)                             | `docs/spec/schema.md`                       | Durable task/agent/artifact store; swap to PG for multi-tenant           |
| `actors/` + `characters/`                                   | `docs/spec/actors.md`, `character-setup.md` | **Agent** registry: role, system prompt, model config, tool list         |
| `assets/` (polymorphic)                                     | `docs/spec/assets.md`                       | **Artifacts**: code, docs, data, notebooks linked to any entity          |
| `generation/` (streaming, cancellation, step-pipeline)      | `docs/spec/implementation.md`               | LLM call layer for any agent turn; streaming UI already built            |
| `assistant/` (rule-based help, commands)                    | `docs/spec/assistant-commands.md`           | **Copilot layer**: suggestions, text improvement, idea prompts           |
| `story/` + `turning/` (multi-LLM orchestration, GM, quests) | `docs/spec/multi-llm-story.md`              | **Multi-agent orchestration** primitive — turn manager = agent scheduler |
| `group-chat/` (mentions, turn order)                        | `docs/frontend/chat/group-chat.md`          | **Multi-agent conversation** with @mention routing                       |
| `crypto/` (AES-256-GCM, key hierarchy, BYOK)                | `docs/spec/crypto.md`                       | **Confidential business data** at rest; per-workspace keys               |
| `users-sessions/` (roles, remote sessions)                  | `docs/spec/users-sessions.md`               | **Team/multi-user** access; role guard already in `auth-middleware`      |
| `plugins/` (loader, registry, types)                        | `docs/spec/plugin-system.md`                | **Tool / integration marketplace** (core/community/local)                |
| `transport/` (HTTP/2, WS, SSE)                              | `docs/spec/transport-unified.md`            | Streaming + co-authoring + live agent status                             |
| `logger/` (structured, censors, rotation)                   | `docs/spec/logging.md`                      | **Audit trail** foundation (needs audit-specific sink)                   |
| `content/` (gzip/zstd/brotli, minify)                       | `docs/spec/content-compression.md`          | Cheap large-artifact storage                                             |
| `frontend/` (htmx + Alpine, responsive)                     | `docs/frontend/overview.md`                 | Web workspace UI; TUI for power users (`src/tui/`)                       |

## Why the schema needs almost no change

Per `docs/spec/use-case-agentic-workspace.md`, the existing entity model is
conceptually generic:

- `worlds` → **Epic / Project** (lore→context, description→objective)
- `locations` (future) → **Task** (connections→DAG dependencies)
- `actors` (`actor_type='character'`, `agent_type='ai'`) → **Agent**
  (`system_prompt`→instructions, `settings`→model/tools/MCP)
- `chats` → **Workspace** (add `mode` flag: `'rpg' | 'agentic'`)
- `messages` → add `role='tool'`, `content_type` ∈ `tool_call | tool_result | code | artifact`
- `assets` → **Artifact** (`asset_type` ∈ `code | document | data | notebook`)

The `string`-to-enum audit (`docs/meta/analysis/string-to-enum-migration.md`) is
_relevant here_: tightening `messages.content_type`, `actors.agent_type`, and
`assets.asset_type` to enums makes the schema safe for dual-purpose use with
zero DB changes (Kysely `Generated<string>` keeps columns as text).

## What is present but under-powered for business

| Capability       | Present?                                    | Gap for business use                     |
| ---------------- | ------------------------------------------- | ---------------------------------------- |
| Tool execution   | Spec only (`src/agent/runtime.ts` proposed) | **No sandbox, no real tool registry**    |
| RAG / embeddings | Not built (`memory-system.md` unbuilt)      | No grounding over private docs           |
| Audit logging    | Structured logger only                      | No tamper-evident, queryable audit store |
| Auth / tenancy   | Roles + sessions                            | No SSO/SAML, no org/tenant isolation     |
| Cost governance  | Token counts tracked                        | No per-agent/per-user budgets or quotas  |
| Workflow DAG     | `task_dependencies` proposed                | No scheduler/engine                      |

## Conclusion

Data modeling is solved. The platform can represent agentic/business data today
with a `mode` flag and two tables. The investment must go to **execution
(sandbox + tools), grounding (RAG), and governance (audit + RBAC + cost)** — none
of which require re-architecting the existing layers.

_Reintegrate as: appendix to `docs/spec/use-case-agentic-workspace.md`._
