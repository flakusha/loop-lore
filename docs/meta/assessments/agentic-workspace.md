# Agentic Workspace — Deep Dive

Expansion of `docs/spec/use-case-agentic-workspace.md` with orchestration
patterns drawn from 2025–2026 industry practice (Azure Agent Framework, CrewAI,
LangGraph, AutoGen) and the **Enterprise RAG** pattern (Microsoft AI Agent
Runbooks, GraphRAG).

## 1. Agent runtime model

The workspace spec proposes refactoring `src/assistant/service.ts` →
`src/agent/runtime.ts`. Recommended shape, grounded in orchestration patterns:

- **Agent** = `actors` row (`agent_type='ai'`) + `settings` holding model,
  tools, MCP servers, temperature/maxTokens.
- **Tool registry** = declarative catalog; each tool declares I/O schema,
  sandbox tier, and timeout. Reuse `plugins/` loader for community tools.
- **Runtime** = executes one agent turn: assemble context → call LLM →
  parse `tool_call` messages → execute tool in sandbox → append `tool_result`
  → loop until `stop`. Maps 1:1 onto `generation/` step-pipeline + `turning/`
  TurnManager.
- **Orchestrator** (multi-agent) = a coordinator agent that routes subtasks to
  specialist agents via `group-chat/` @mention + turn order. This is the same
  machinery already specced for multi-LLM story GM/quest orchestration.

## 2. Tool sandboxing (the #1 missing piece)

Industry consensus (Google Agent Sandbox, Azure Container Apps): tool execution
must be **isolated, time-boxed, and egress-controlled**. For loop-lore:

- **Tier A (pure):** regex/transform, `create_doc`, `convert_format` — no
  sandbox needed (in-process).
- **Tier B (code):** `run_code`, `run_shell`, `read_file`, `write_file` — WASM
  or container with read-only mounts + resource caps (`toolTimeoutMs: 120000`).
- **Tier C (network):** `http_request`, `mcp_call`, `search` — egress via
  configurable proxy/allowlist (per the workspace spec's security section).

Reuse `crypto/` key hierarchy to scope per-workspace permission + the
`auth-middleware` role guard for tool authorization.

## 3. Grounding — borrow Enterprise RAG, don't invent

Business agents must answer from **private data**, not parroting training.
Pattern (Microsoft Enterprise-RAG runbook; GraphRAG for relational knowledge):

- **Index:** `assets` (documents/data) + `actor_memories` (semantic) → embedding
  store → retrieval at generation boundary.
- **Retrieve:** inject top-k chunks into agent context (reuse `generation/`
  prompt-template stage).
- **Ground/verify:** the proposed **#10 lore-consistency checker** is exactly a
  fact-verification pass — repurpose it as a _grounding guard_ that flags
  agent claims contradicting retrieved context.
- **GraphRAG option:** `#13 memory/knowledge-graph visualizer` already models
  entity edges via `asset_links` — a natural fit for relational enterprise
  knowledge.

Building a bespoke RAG is unnecessary; the repo needs an **embedding + retrieval
adapter** plugged into `generation/`.

## 4. Memory architecture for agents

Maps onto the three-tier memory spec (`docs/spec/memory-system.md`):

- **Episodic:** conversation history (`messages`) — already durable.
- **Semantic:** extracted facts as `assets` (`label='memory'`) — feeds RAG.
- **Procedural:** agent playbooks/patterns in `actor.settings.memory`.

`#12 cross-chat global memory` gives agents a persistent persona/knowledge
across workspaces — the "remembers your org" property enterprises expect.

## 5. UI for the workspace mode

From the workspace spec, `chat.mode='agentic'` switches layout:

- **Web:** LEFT agents list · CENTER workspace/chat · RIGHT artifact gallery ·
  BOTTOM task graph (DAG of `locations`/`task_dependencies`).
- **TUI:** agent list replaces character list; tool output as structured logs;
  task graph via `blessed-contrib`.

This is a _view-mode_ change, not a new app — confirm `src/frontend/` htmx
partials already support mode-switching shells.

## 6. Observability (non-negotiable for business)

Agents cost money and fail silently. Reuse:

- `#27 conversation analytics` (token cost, sentiment) → per-agent cost.
- `#28 model-comparison dashboard` (`model_comparisons` table) → A/B agent
  quality.
- `#29 synthetic fine-tune export` (`artifacts-system.md`) → improve agents from
  real runs.
- Structured `logger/` → add an **audit sink** (who ran which tool, on what
  data, with what result).

## 7. Risk register

| Risk                            | Mitigation                                |
| ------------------------------- | ----------------------------------------- |
| Tool escape / data exfiltration | Tiered sandbox + egress allowlist         |
| Hallucination on private data   | Enterprise RAG + #10 grounding guard      |
| Cost blow-up                    | Per-agent budgets (#27), `maxTokens` caps |
| Non-repudiation / compliance    | Audit sink on `logger/`                   |
| Vendor lock-in on embeddings    | Adapter interface, swappable provider     |

_Reintegrate as: expansion of `docs/spec/use-case-agentic-workspace.md`._
