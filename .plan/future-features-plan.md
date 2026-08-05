# Future Features Plan

Consolidated plan for features identified during research and reconciliation. Each item maps to a git issue (EPIC/FEAT/TASK).

**Source:** Feature analysis, roadmap gap analysis, reconciliation findings, ideas hub.

---

## Tier 1 — v0.1 Remaining (Active Sprint)

These complete the v0.1 MVP. Already tracked in `plan.md`:

| Epic | Feature                    | Priority | Status         |
| ---- | -------------------------- | -------- | -------------- |
| E16  | Observability              | P0       | 🟡 In Progress |
| E14  | Import/Export              | P1-High  | ⬜ Not Started |
| E23  | Assistant Commands         | P1-High  | ⬜ Not Started |
| E24  | Filtering & Pagination     | P1-High  | ⬜ Not Started |
| E11  | Admin & Settings           | P1       | ⬜ Not Started |
| E17  | Encryption Foundation      | P1       | ⬜ Not Started |
| E15  | i18n & Accessibility       | P2       | ⬜ Not Started |
| E22  | RPG Mechanics Core         | P2       | ⬜ Not Started |
| E21  | Notification Expansion     | P2       | ⬜ Not Started |
| E20  | E2E Performance Benchmarks | P2       | ⬜ Not Started |

---

## Tier 2 — New Epics (Post-v0.1 Core)

### EPIC-2026-32: API Versioning Strategy

**Goal:** Full-transitive compatibility for backend endpoints. Never break existing clients.

| Feature                   | ID           | Effort | Description                                   |
| ------------------------- | ------------ | ------ | --------------------------------------------- |
| Version prefix routing    | FEA-2026-035 | Med    | `/api/v1/*`, `/api/v2/*` Elysia plugin groups |
| Response envelope version | FEA-2026-036 | Low    | Add `meta.api_version` to all responses       |
| Legacy redirect           | FEA-2026-037 | Low    | `/api/{resource}` → `/api/v1/{resource}`      |
| Deprecation headers       | FEA-2026-038 | Low    | `Sunset`, `Deprecation`, `Link` headers       |
| OpenAPI/Swagger           | FEA-2026-039 | Med    | Auto-generate from TypeBox schemas            |

**Spec:** `docs/spec/api-versioning.md`

### EPIC-2026-33: DB Content Versioning & Migrations Reconciliation

**Goal:** Track DB schema version, content format versions, fix migration gaps.

| Feature                      | ID           | Effort | Description                                        |
| ---------------------------- | ------------ | ------ | -------------------------------------------------- |
| Schema version table         | FEA-2026-040 | Low    | `schema_version` table + queryable getter          |
| Migration reconciliation     | FEA-2026-041 | Med    | Document gaps (002-007), add migration index doc   |
| Content versioning framework | FEA-2026-042 | Med    | Registry + batch runner for `data_version` columns |
| Migration testing            | FEA-2026-043 | Med    | Validate migrations against :memory: schemas       |
| Migration documentation      | FEA-2026-044 | Low    | `docs/spec/migrations.md` with full index          |

**Spec:** `docs/spec/db-versioning.md`

### EPIC-2026-34: Conversation Branching

**Goal:** Enable draft/alternative flows via tree-structured message history.

| Feature           | ID           | Effort | Description                                               |
| ----------------- | ------------ | ------ | --------------------------------------------------------- |
| Branch navigation | FEA-2026-045 | Low    | `parent_id` already in schema; add tree traversal queries |
| Branch UI         | FEA-2026-046 | Med    | Visual branch selector in chat view                       |
| Branch merge      | FEA-2026-047 | Med    | Merge alternative branches back to main thread            |

**Schema ready:** `messages.parent_id` exists (migration 001).

### EPIC-2026-35: Plugin Extension Points

**Goal:** Wire up registered-but-unwired plugin extension points.

| Feature               | ID           | Effort | Description                                              |
| --------------------- | ------------ | ------ | -------------------------------------------------------- |
| EventBus              | FEA-2026-048 | Med    | `src/plugins/events.ts` — pub/sub for loose coupling     |
| ToolExecutor          | FEA-2026-049 | Med    | `src/plugins/tools.ts` — AI-executable function registry |
| UI component mounting | FEA-2026-050 | Low    | `GET /api/plugins/ui-components` route                   |
| Config merge          | FEA-2026-051 | Low    | Wire `configSchema` from plugins into config loader      |

**Gap found:** `src/plugins/types.ts` + `registry.ts` exist; extension points registered but no EventBus, no ToolExecutor, no UI mounting.

---

## Tier 3 — High-Value Features (Specified)

### EPIC-2026-36: Memory & Knowledge Systems

| Feature             | ID           | Effort | Description                                      |
| ------------------- | ------------ | ------ | ------------------------------------------------ |
| Three-tier memory   | FEA-2026-052 | High   | Episodic/semantic/procedural per spec            |
| Memory selection UI | FEA-2026-053 | Med    | Mid-chat panel for pinning, selection            |
| Lorebook activation | FEA-2026-054 | Med    | Sticky entries, cooldowns, activation conditions |
| Cross-chat memory   | FEA-2026-055 | Med    | Persistent persona/knowledge across workspaces   |

### EPIC-2026-37: Analytics & Observability

| Feature                | ID           | Effort | Description                                     |
| ---------------------- | ------------ | ------ | ----------------------------------------------- |
| Conversation analytics | FEA-2026-056 | Low    | Per-chat cost + quality dashboard               |
| Model comparison       | FEA-2026-057 | Low    | A/B agent/model quality via `model_comparisons` |
| Memory visualizer      | FEA-2026-058 | Med    | Knowledge graph over `asset_links`              |

### EPIC-2026-38: Output Control & Transforms

| Feature                  | ID           | Effort | Description                            |
| ------------------------ | ------------ | ------ | -------------------------------------- |
| Regex output transforms  | FEA-2026-059 | Low    | Parse agent/tool output at render time |
| Smart-regen transforms   | FEA-2026-060 | Low    | One-click draft polish                 |
| Prompt library           | FEA-2026-061 | Low    | Tagged prompt snippets and templates   |
| Lore-consistency checker | FEA-2026-062 | High   | Grounding/fact-check guard for RAG     |

---

## Tier 4 — Strategic / Post-MVP

| Feature                    | ID           | Effort | Description                          |
| -------------------------- | ------------ | ------ | ------------------------------------ |
| Tool/Function Calling      | FEA-2026-063 | High   | 3-layer architecture                 |
| BYOK (Bring Your Own Key)  | FEA-2026-064 | Med    | User brings own LLM                  |
| RAG Integration            | FEA-2026-065 | High   | Vector DB knowledge grounding        |
| Agentic Workspace Mode     | FEA-2026-066 | High   | Dual-use: RPG ↔ workspace            |
| Frontend Story Mode UI     | FEA-2026-067 | Med    | GM panel, quest log, story chat      |
| Message Archiving          | FEA-2026-068 | Med    | Soft delete, cascade, restore, purge |
| Character Relationships    | FEA-2026-069 | Med    | Relational graph + stat tracking     |
| Community Template Share   | FEA-2026-070 | Low    | Share agent/workflow templates       |
| Multimodal Input           | FEA-2026-071 | Med    | Docs/images/voice as agent input     |
| Synthetic Fine-tune Export | FEA-2026-072 | Med    | Improve agents from real runs        |
| Co-authoring Presence      | FEA-2026-073 | Med    | Live team editing via WebSocket      |
| Cross-device E2E Sync      | FEA-2026-074 | Med    | Enterprise/field deployment          |

---

## Quick Wins (Low Effort, High Leverage)

From feature-analysis. Not yet in any epic:

| #  | Feature                    | ID           | Effort | Value |
| -- | -------------------------- | ------------ | ------ | ----- |
| Q1 | Regex output transforms    | FEA-2026-059 | Low    | High  |
| Q2 | Smart-regen transforms     | FEA-2026-060 | Low    | High  |
| Q3 | Conversation analytics     | FEA-2026-056 | Low    | Med   |
| Q4 | Model comparison           | FEA-2026-057 | Low    | Med   |
| Q5 | Bulk data export (zip-all) | FEA-2026-075 | Low    | Med   |

---

## Governance Substrate Gaps

Not in any feature — enterprise blockers for agentic workspace:

| Gap               | Description                         | Priority |
| ----------------- | ----------------------------------- | -------- |
| Sandbox execution | Isolated code execution for agents  | P3       |
| RAG integration   | Knowledge-grounded responses        | P3       |
| Audit trails      | Track who did what, when            | P3       |
| RBAC              | Role-based access beyond admin/user | P3       |
| Cost controls     | Per-user/per-chat token budgets     | P3       |

---

## Cross-References

- `.plan/implementation-plan.md` — active v0.1 checklist
- `.plan/roadmaps/roadmap.md` — full roadmap with all planned features
- `.plan/backlog.md` — deferred queue
- `/docs/ideas/` — 34 ideas across 8 themes
- `/docs/meta/assessments/feature-analysis.md` — business relevance analysis
- `docs/spec/api-versioning.md` — API versioning spec
- `docs/spec/db-versioning.md` — DB versioning spec
