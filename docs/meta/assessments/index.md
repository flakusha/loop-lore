# Agentic / Business / Assistant Use — Assessment

Deep research on how loop-lore serves **ordinary** (non-RPG) agentic, business, and
assistant workloads, evaluated against the platform's real architecture and the
features proposed in the **latest analysis** (`docs/spec/use-case-agentic-workspace.md`,
`docs/ideas/*`, `docs/meta/analysis/*`).

> **Status:** Assessment only. No existing docs modified. Intended to be reintegrated
> into `docs/spec/`, `docs/ideas/`, and `docs/meta/` once reviewed. Reintegration
> hints are noted per file in the "Reintegrate as" line.

## Scope

- **Ordinary use** = anything that is not roleplay: knowledge work, research,
  operations, content production, team collaboration, process automation.
- **Agentic** = LLM + tools + memory + multi-step autonomy (agents that call tools,
  keep state, and orchestrate).
- **Business** = deployment inside an organization: access control, audit, cost
  governance, RAG over private data, integrations.
- **Assistant** = the conversational copilot layer (already present in `src/assistant/`).

## Methodology

1. Mapped loop-lore's concrete modules (`src/*`, `docs/spec/*`) to generic
   agentic/business primitives.
2. Cross-checked against 2025–2026 industry patterns: multi-agent orchestration
   (Azure Agent Framework, CrewAI, LangGraph, AutoGen), the **Enterprise RAG**
   pattern (Microsoft runbooks, GraphRAG), and **agent sandboxing** (Google Agent
   Sandbox, isolated tool execution).
3. Folded in the latest in-repo analysis: the agentic-workspace use case and the
   34 ideas across 8 themes in `docs/ideas/`.
4. Produced gap analysis + prioritized recommendations (reuse-first).

## Files in this folder

| File                    | Covers                                                       | Reintegrate as                                 |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| `platform-fit.md`       | What already exists and maps cleanly to agentic/business use | appendix to `use-case-agentic-workspace.md`    |
| `agentic-workspace.md`  | Deep dive on the agentic workspace mode + orchestration      | expansion of `use-case-agentic-workspace.md`   |
| `business-scenarios.md` | Concrete ordinary business/assistant scenarios               | new `docs/spec/use-case-*.md` entries          |
| `feature-analysis.md`   | How the 34 latest ideas strengthen (or miss) ordinary use    | appendix to `docs/ideas/index.md` |
| `recommendations.md`    | Prioritized, reuse-first build plan                          | input to `docs/meta/roadmap.md`                |

## Headline findings

- **The platform is already 70% of an agentic workspace.** Worlds→projects,
  actors→agents, chats→workspaces, assets→artifacts, messages→tool calls — the
  schema and service layer were built generic enough that the agentic-workspace
  spec needs _no_ new tables beyond `locations`/`task_dependencies` and a `mode`
  flag.
- **The missing 30% is execution + governance, not data modeling.** Tool sandbox,
  RAG/embedding pipeline, audit, RBAC/SSO, cost controls, and a workflow DAG engine
  are the real gaps.
- **The latest ideas are RPG-weighted but several are direct business wins:**
  #6 regex transforms (structured output), #10 lore-consistency (grounding/fact-
  check), #12/#13 cross-chat memory + knowledge graph (enterprise memory),
  #27–#29 analytics (cost/quality observability), #25 E2E sync (enterprise deploy).
- **Recommendation:** ship agentic mode as a _thin_ extension (mode flag + agent
  runtime + tool registry), reuse the plugin system for integrations, and borrow
  the Enterprise RAG pattern for grounding rather than inventing one.
