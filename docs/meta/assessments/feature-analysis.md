# Feature Analysis — Latest Ideas vs. Ordinary Use

Evaluates the 34 ideas in `docs/ideas/` (8 themes) + the agentic-workspace spec
against ordinary agentic / business / assistant needs. Marked **Business win**,
**Neutral**, or **RPG-only**.

## Direct business / agentic wins

| #  | Idea                                | Why it matters for ordinary use                                                  | Effort |
| -- | ----------------------------------- | -------------------------------------------------------------------------------- | ------ |
| 6  | Regex output transforms             | Parse agent/tool output into structured fields at render — core for tool results | Low    |
| 7  | Auto-translation layer              | Multilingual business + global teams                                             | Med    |
| 8  | Smart-regen transforms              | One-click polish of any draft (reports, emails)                                  | Low    |
| 10 | Lore-consistency checker            | **Grounding/fact-check guard** for RAG agents                                    | High   |
| 12 | Cross-chat global memory            | Persistent agent persona/knowledge across workspaces                             | Med    |
| 13 | Memory / knowledge-graph visualizer | Enterprise knowledge graph over `asset_links`                                    | Med    |
| 25 | Cross-device E2E sync               | Enterprise/field deployment; `crypto.md` already supports                        | Med    |
| 26 | Multimodal input                    | Docs/images/voice as agent input                                                 | Med    |
| 27 | Conversation analytics              | **Per-agent cost + quality** observability                                       | Low    |
| 28 | Model-comparison dashboard          | A/B agent/model quality (`model_comparisons`)                                    | Low    |
| 29 | Synthetic fine-tune export          | Improve agents from real runs (`artifacts-system`)                               | Med    |
| 9  | Prompt/lorebook marketplace         | Community agent/template sharing via plugin registry                             | Med    |
| 18 | Community template share            | Share agent/workflow templates (`export.md`)                                     | Low    |
| 19 | Co-authoring presence               | Live team editing of agent outputs (WS)                                          | Med    |
| 20 | Shared persistent worlds            | Multi-user collaborative workspace (CRDT)                                        | High   |
| 21 | Public story feed + moderation      | Internal knowledge publishing + safety                                           | Med    |

## Indirect / enabler wins

| #  | Idea                          | Enabler role                               |
| -- | ----------------------------- | ------------------------------------------ |
| 15 | Procedural asset pipelines    | Auto-generate charts/diagrams as artifacts |
| 16 | Plot autopilot                | Analogy: agent "next step" proposer        |
| 17 | What-if branch simulator      | Analogy: scenario simulation for decisions |
| 23 | Offline-first PWA + on-device | Private/solo agent on edge                 |
| 24 | Mobile-native UX              | Field/business mobile agent access         |

## RPG-only (low ordinary-use value)

| #     | Idea                                                                     | Note                             |
| ----- | ------------------------------------------------------------------------ | -------------------------------- |
| 1–5   | Emotion portraits, VN mode, adaptive audio, TTS narration, dynamic music | Immersion; not business-relevant |
| 11    | Relationship-drift timeline                                              | RPG NPC disposition              |
| 14    | World continues without you                                              | RPG "alive world"                |
| 22    | Async NPC mail                                                           | RPG flavor                       |
| 30    | Automated balance playtest bot                                           | RPG tuning                       |
| 31–34 | 3D worlds & navigation                                                   | Presentation; device-gated       |

## Coverage gaps the latest analysis does NOT address

These are required for ordinary business use but absent from both the ideas hub
and the agentic spec's "what exists":

1. **Tool execution sandbox** — spec mentions it; no design. Highest priority.
2. **Embedding + retrieval adapter (RAG)** — memory-system unbuilt; Enterprise
   RAG is the proven pattern to borrow.
3. **Audit store / compliance sink** — `logger/` is not queryable/immutable.
4. **RBAC / SSO / tenant isolation** — roles exist; org tenancy does not.
5. **Cost governance** — token counts exist; no budgets/quotas per agent/user.
6. **Workflow DAG engine** — `task_dependencies` table proposed, no scheduler.
7. **Human-in-the-loop / approval gates** — needed before agents act on
   external systems (Jira, SQL writes).

## Verdict

The latest analysis is **RPG-first but quietly agentic-friendly**: ~16 of 34
ideas are direct or indirect business wins, and the highest-leverage ones
(#6, #8, #27, #28, #18) are **low effort**. The real gap is not feature ideas — it is
the **execution + governance substrate** (sandbox, RAG, audit, RBAC, cost) that
no current idea fully covers.

### Cross-references

- **Quick wins** (#6, #8, #18, #27, #28): promoted to `.plan/backlog.md` § Quick Wins and `docs/meta/roadmap.md` § v0.1 MVP.
- **Coverage gaps** (sandbox, RAG, audit, RBAC, cost, DAG, approval gates): tracked as enterprise blockers in `.plan/backlog.md` — not yet in any epic. Add to P3 when epics are scoped.
- **Ideas hub**: appendix to `docs/ideas/index.md` should add a "Business relevance" column per-theme.
