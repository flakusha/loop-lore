<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Docs-vs-Plan Gap Audit (2026-09-19)

**Status:** Audit complete; 76 gap tickets created. Worktree: `docs-vs-plan-gap-tickets`.

**Type:** Audit

**Tags:** audit, epics, tickets, docs-gap

**Priority:** P2

**Overview:** Cross-cutting audit of design docs against planning artifacts; enumerated 76 implementation gaps and created one ticket per gap.

**Effort:** XL (audit + ticket creation)

**Summary:** Cross-cutting audit of `docs/spec/`, `docs/research/`, `docs/ideas/`, `docs/frontend/`, and `docs/meta/` against `.plan/epics/` and `.plan/tickets/`. Identifies 76 high-level concepts that have been specced or referenced but never decomposed into implementation tickets.

**Context:** Spawned 2026-09-19 to enumerate gaps between design docs and planning artifacts. Each gap was converted into one `giwt ticket` with source-doc citation in the body and `--epic` pointing to the closest existing epic or `proposed:epic-X` for net-new epics.

**Acceptance Criteria:**
- [x] 4 parallel scout subagents complete (spec/research+ideas/frontend/meta)
- [x] 76 new tickets created in `docs-vs-plan-gap-tickets` worktree (42 FEAT + 34 TASK)
- [x] `index.json` regenerated via `bun run plan:sync:fix`
- [ ] Tickets reviewed and prioritized in next worktree pass

---

## Audit Methodology

Four parallel scout agents enumerated every non-trivial concept in the docs tree, cross-referenced each against `.plan/epics/` (filename slug) and `.plan/tickets/` (filename + first 30 lines).

| Scout | Source | Output |
|-------|--------|--------|
| ScoutDocsSpec | `docs/spec/` (80 non-stub specs) | 22 covered, 4 partial, 20 gaps |
| ScoutResearchRPG | `docs/research/`, `docs/meta/research/`, `docs/ideas/` | 9 RPG systems audited, 34 idea-stage concepts |
| ScoutFrontend | `docs/frontend/` (35 files) | 18 epics + 77 tickets cross-referenced; 10 gaps, 6 partial |
| ScoutMetaAudit | `docs/meta/` (assessments, reviews, code-practices) | 34 unmaterialized feature concepts |

---

## Gap Inventory by Source

### A. docs/spec/ (34 gaps)

RPG (2): rpg-mechanics-extensions.md, replayability.md
Platform/Infra (5): scheduler, platform-support, build-deploy, logging, performance-dashboard
Auth/Security (2): auth-middleware, profanity-filter
Data/DB (3): migrations, db-versioning, db-reinit-retention
Content/Moderation (2): attachment-moderation, content-compression
Character/Narrative (2): character-migration, character-interactions
Memory/Lore (2): memory-system, lore
Assets/Attribution (1): assets-attribution
NSFW (2): nsfw, nsfw-integration
Template/Prompt (1): template-system
User/Session (1): users-sessions
Display/Avatar (1): emotion-avatars
Access Model (1): access-model-clarification
Cross-cutting (1): observability

Partial (3): battle, battle-integration, rpg-mechanics — epics exist but cover only sub-systems.

### B. docs/research/ (9 RPG systems audited)

| System | Coverage | Gap Ticket |
|--------|----------|------------|
| D&D 5e / d20 | Full | — |
| Pathfinder 2E | Partial | in `epic-resolution-system` |
| PbtA | Partial | `TASK-resolution-family-decision` |
| FATE Core | Concept only | NEW: Aspects + Stress + Skill Pyramid |
| Savage Worlds | Concept only | Bennies in `epic-agency-story-points` |
| GURPS | Tags only | NEW: Point-buy creation |
| Forge Engine | None | NEW: SAGE Energy Pool |
| MARS RPG | None | NEW: Modules/Modes |
| Blades in the Dark | None | NEW: Position/Effect + Clocks |
| Ironsworn | None | NEW: Oracle d6+d10 |

### C. docs/ideas/ (28 ideas with no plan artifact)

Immersion (5), prompt/output (4), memory (3), authoring (4), social (4), platform (4), analytics (4), 3D (3).

### D. docs/frontend/ (10 gaps + 6 partial)

Gaps: visual-novel-mode, multi-llm-story, chat-assistant, worlds, memories, text-effects-overlays, story-notes-panel, message-reply-threading, markdown-preview, sidebar-search-filter.

### E. docs/meta/ (34 cross-cutting gaps)

Admin (5): Analytics, Moderation, Engagement, Error Monitoring, GDPR
Agentic Substrate (7): Tool sandbox, RAG adapter, Audit store, RBAC/SSO, Cost governance, Workflow DAG, Approval gates
Code Quality (7): EventBus/ToolRegistry, plugin routes, complexity cap, Zod/TypeBox, tsconfig, eslint-import, test DB dialects
Attachment Pipeline (5): Content analysis, review queue, thumbnails, EXIF, frontend UI
Battle/Quest/Faction/Inventory (8): quest backend, encounter engine, faction system, battle core, inventory UI, item crafting/rarity/properties, frontend-mode

---

## Tickets Created (76 total)

### FEAT (42)

- **Admin (5):** admin-analytics-dashboard, full-moderation-system, user-engagement-leaderboards, error-monitoring-alerting, gdpr-user-data-rights
- **Agentic Substrate (7):** tool-execution-sandbox, rag-retrieval-adapter, queryable-audit-store, rbac-sso-tenant-isolation, per-agent-cost-governance, workflow-dag-engine, human-in-the-loop-approval-gates
- **RPG (8):** fate-aspects-system, forge-engine-energy-pool, blades-in-the-dark, mars-modules, gurps-point-buy, fate-stress-tracks, ironsworn-oracle, fate-skill-pyramid
- **Attachments (3):** content-analysis-pipeline, review-queue-admin-ui, frontend-ui
- **Battle/Quest/Faction (5):** battle-core-implementation, quest-system-backend, random-encounter-engine, faction-system-backend, inventory-management-ui
- **Items (3):** crafting-system, rarity-system, property-system
- **Ideas (28):** emotion-reactive-portraits, directors-mode, regex-output-transforms, auto-translation-layer, smart-regen-transforms, prompt-marketplace, relationship-drift-timeline, cross-chat-global-memory, knowledge-graph-visualizer, plot-autopilot, what-if-branch-simulator, community-template-share, co-authoring-presence, shared-persistent-worlds, public-story-feed, async-npc-mail, offline-first-pwa, mobile-native-ux, cross-device-e2e-sync, multimodal-input, conversation-analytics, model-comparison-dashboard, fine-tune-export, balance-playtest-bot, 3d-world-map, 3d-character-avatar, immersive-scene, procedural-asset-pipelines
- **Frontend (4):** visual-novel-mode-full, multi-llm-story-mode, per-chat-assistant-gm, worlds-frontend
- **Memory Frontend (1):** memory-frontend-3-types
- **Config (1):** frontend-mode-cors

### TASK (34)

- **Infra/Auth (12):** auth-middleware, scheduler-implementation, platform-support, build-deployment-pipeline, logging-system-jsonl, performance-dashboard, profanity-filter, migrations-conventions, db-content-versioning, db-reinit-retention, content-compression, attachment-moderation-pipeline
- **Character/Lore/Avatar (5):** character-migration, character-interactions, lore-system, asset-attribution, emotion-avatars
- **NSFW (2):** nsfw-rating-schema, nsfw-cross-cutting-integration
- **Templates/Memory (3):** regex-extraction, template-system, users-roles-sessions
- **Battle/RPG (4):** battle-core-round-loop, rpg-mechanics-base, battle-integration-wiring, replayability
- **Code Quality (7):** eventbus-toolregistry, plugin-routes-elysia, cognitive-complexity, zod-typebox-reconciliation, frontend-tsconfig, eslint-plugin-import, test-db-dialect
- **Frontend UX (5):** chat-text-effects-overlays, story-notes-panel, message-reply-threading, markdown-preview, chat-sidebar-search
- **Memory/Observability (3):** access-model-composition, advanced-memory-systems, observability-telemetry

---

## Proposed New Epics (37 candidates)

Each ticket references `proposed:epic-X` for epics not yet in `.plan/epics/`. Promotion candidates:

| Cluster | Proposed Epics |
|---------|----------------|
| admin | epic-admin-analytics, epic-admin-moderation, epic-user-engagement, epic-error-alerting, epic-gdpr-data-rights |
| agentic | epic-rag-adapter, epic-audit-store, epic-rbac-tenancy, epic-cost-governance, epic-approval-gates |
| rpg | epic-rpg-action-economy, epic-modular-rules, epic-replayability |
| ideas | epic-directors-mode, epic-output-control-transforms, epic-marketplace, epic-knowledge-graph-viz, epic-procedural-assets, epic-plot-autopilot, epic-branch-simulator, epic-co-authoring, epic-shared-worlds, epic-public-feed, epic-npc-mail, epic-offline-pwa, epic-cross-device-sync, epic-multimodal-input, epic-conversation-analytics, epic-model-dashboard, epic-finetune-export, epic-balance-bot, epic-3d-world-map, epic-3d-avatars, epic-immersive-scene |
| infra | epic-attachment-moderation, epic-asset-thumbnail, epic-asset-metadata, epic-scheduler, epic-platform-support, epic-db-versioning, epic-content-compression, epic-regex-extraction |
| code | epic-frontend-strictness |
| auth | epic-access-model |
| rpg-core | epic-battle-core |

Consolidation: ideas epics → new `epic-platform-research.md`. Agentic epics → `epic-agentic-execution-substrate.md`.

---

## Open Follow-ups

- [ ] Triangulate tickets against each proposed epic; promote or merge
- [ ] Prioritize the 12 P0/P1 admin+agentic tickets for first worktree pickup
- [ ] Confirm 28 idea-stage concepts are wanted (YAGNI check per `epic-emergent-narrative-design`)
- [ ] Update `docs/spec/` to mark gap-ticket cross-references
- [ ] Run `bun run plan:validate` to surface new debt

---

## References

- Scout reports: agent://ScoutDocsSpec, agent://ScoutResearchRPG, agent://ScoutFrontend, agent://ScoutMetaAudit
- Inspiration sources: docs/meta/research/rpg-systems-comparison.md, docs/ideas/index.md
- Existing epic catalog: .plan/epics/epics-index.md
