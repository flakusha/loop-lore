# Backlog

Features not under active development. `plan.md` tracks active work; `open-items.md` tracks bugs/debt.

## P0 — Immediate Next (v0.1 In-Progress)

Partial implementation exists in `src/`. Finishing these is current active work.

| Epic | Item                                                                               | Source  | Status         |
| ---- | ---------------------------------------------------------------------------------- | ------- | -------------- |
| 16   | Observability — telemetry, admin analytics, CI config, Playwright responsive tests | plan.md | 🟡 In progress |

### Completed (moved from P0/P1)

| Epic | Item                                                                                   | Status      |
| ---- | -------------------------------------------------------------------------------------- | ----------- |
| 10   | Generation Foundation — tool-call loop, provider failover, SSE reconnect              | ✅ Complete |
| 11   | Admin & Settings — admin middleware, page routes, user prefs modal, plugin management | ✅ Complete |
| 12   | Memory Foundation — keyword filtering, type enum, context compaction, A/N injection    | ✅ Complete |
| 13   | Frontend Responsive — mobile breakpoints, touch targets, keyboard shortcuts, HTMX, etc | ✅ Complete |
| 14   | Import/Export — file-based character import, chat export, PNG steganography, bulk     | ✅ Complete |
| 19   | Chat Notifications — cross-chat SSE, read-state schema, unread badge, toast            | ✅ Complete |

## P1 — Next Cycle (v0.1 Not Started)

Ordered by user impact × effort. Items with partial `src/` code listed first.

| Epic | Item                                                                                  | Effort | Partial Code? | plan.md ref |
| ---- | ------------------------------------------------------------------------------------- | ------ | ------------- | ----------- |
| 17   | Encryption Foundation — e2e AES-256-GCM, asset encryption, access mgmt, key rotation | High   | Spec only     | Epic 17     |
| 15   | i18n & Accessibility — server-side i18n module, ARIA pass, keyboard nav, 10 locales   | High   | Minimal       | Epic 15     |

## P2 — Specified, Not Implemented

| Feature                                                     | Spec                                                                    | Notes                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| E2E Performance Benchmarks                                  | `docs/spec/e2e-benchmarks.md`                                           | Benchmark runner, diff/trend scripts, CI integration                               |
| ~~Multi-format character import (PNG/YAML/TOML/CHARX)~~ | ~~`docs/spec/character-setup.md`~~ | ✅ Implemented (Epic 14) |
| Impersonation (`chat.impersonate_id`)                       | `docs/spec/character-setup.md`                                          | Not implemented                                                                    |
| RPG mechanics (dice, stats, combat, XP, loot)               | `docs/spec/rpg-mechanics.md`, `docs/spec/rpg-implementation-roadmap.md` | `src/rpg/` does not exist                                                          |
| Three-tier memory system (episodic/semantic/procedural)     | `docs/spec/memory-system.md`                                            | Only `actor_memories` table exists                                                 |
| Artifact system (code/docs/datasets as assets)              | `docs/spec/artifacts-system.md`                                         | Not implemented                                                                    |
| Agentic workspace mode                                      | `docs/spec/use-case-agentic-workspace.md`                               | Not implemented                                                                    |
| ~~Client-side encryption (AES-256-GCM, key hierarchy)~~ | ~~`docs/frontend/encryption.md`, `docs/spec/encryption-workflow.md`~~ | ✅ Covered by expanded Epic 17 |
| Frontend story mode UI (GM panel, quest log, story chat)    | `docs/frontend/chat/multi-llm-story.md`                                 | Backend `src/story/` exists; no frontend                                           |
| Message archiving (cascade, restore, purge)                 | `docs/frontend/chat/archiving.md`, `docs/spec/archival-workflow.md`     | Hard delete only                                                                   |
| Memory selection UI (mid-chat panel, pinning, auto-extract) | `docs/frontend/chat/memories.md`                                        | Backend reads memories; no UI                                                      |
| Server-side i18n middleware (`req.t`)                       | `docs/frontend/internationalization.md`                                 | Minimal client-side `__()` only                                                    |
| Anthropic/Ollama/Bedrock providers                          | `docs/spec/provider-system.md`                                          | Only OpenAI-compatible exists                                                      |
| Plugin management API (install/list/enable/disable)         | `docs/spec/plugin-system.md`                                            | Plugin skeleton loads files; no API                                                |
| Signed URLs for asset downloads                             | `docs/spec/assets.md`, `docs/spec/access-model-clarification.md`        | Uses `raw` endpoint with Bearer auth                                               |
| `POST /api/auth/register`                                   | `docs/spec/auth-middleware.md`                                          | Not implemented                                                                    |
| `/api/sessions` routes                                      | `docs/spec/users-sessions.md`                                           | Not implemented                                                                    |
| Notification system with noise filtering                    | `docs/spec/notifications-expansion.md`                                  | Basic toasts exist; full system needed                                             |
| Model comparison reactions                                  | `docs/spec/notifications-expansion.md`                                  | Reactions table exists; no comparison API                                          |
| Assistant `/commands` extension                             | `docs/spec/assistant-commands.md`                                       | Command parser exists (`src/assistant/command-parser.ts`); no slash commands wired |
| Combined filter support                                     | `docs/spec/filtering-pagination.md`                                     | Single filter only                                                                 |

## Quick Wins — Low Effort, High Leverage

From `docs/meta/assessments/feature-analysis.md`. Not yet in any epic.

| #  | Feature                          | Effort | Business Value | Source               |
| -- | -------------------------------- | ------ | -------------- | -------------------- |
| Q1 | Regex output transforms          | Low    | High           | feature-analysis #6  |
| Q2 | Smart-regen transforms (polish)  | Low    | High           | feature-analysis #8  |
| Q3 | Conversation analytics dashboard | Low    | Med            | feature-analysis #27 |
| Q4 | Model-comparison dashboard       | Low    | Med            | feature-analysis #28 |
| Q5 | Bulk data export (zip-all)       | Low    | Med            | ✅ Done (Epic 14) |

## Chore Tasks — Infrastructure & DevOps

| Ticket                                 | Task                                          | Effort  | Priority |
| -------------------------------------- | --------------------------------------------- | ------- | -------- |
| `TASK-dev-tooling-updates`             | Biome 2.5.4, dprint 0.55.2, stylelint 17.14.1 | Low     | Medium   |
| `TASK-regex-extraction-tests`          | Regex to constants + unit tests               | Low–Med | Medium   |
| `TASK-branch-workflow-dev-stg-master`  | dev→stg→master branch workflow                | Med     | Medium   |
| `TASK-test-performance-shared-state`   | Test isolation, parallel ironing              | Med     | Medium   |
| `TASK-agents-scripts-worktree-docs`    | AGENTS.md + .agents worktree docs             | Low     | Medium   |
| `TASK-frontend-e2e-improvements-draft` | Frontend E2E stabilization (draft)            | High    | Low      |
| `TASK-github-pages-vitepress`           | GitHub Pages VitePress docs site              | Low–Med | Low      |
| `TASK-thinking-tag-context-prune`       | LLM `<think>` tag context pruning             | Med     | Medium   |
| `TASK-emotions-avatar-edit-model`       | Emotions avatar — edit model support (blocked) | High | Low      |
| `TASK-3d-character-avatars`             | 3D character avatars (Three.js/VRM)           | High | Low      |
| `TASK-rigged-model-buffer-render`       | Pre-rendered sprite sheets from rigged models | Med  | Low      |
| `TASK-dynamic-avatars-dota-style`       | Animated mugshots (Dota 2 style)              | High | Low      |
| `TASK-emotion-intent-detection`         | Emotion detection + extensible emotion system | Med  | Medium   |
| `TASK-chat-backgrounds-location-sync`   | Chat backgrounds — static/dynamic + location sync | Med–High | Low |
| `TASK-chat-sectioning-multi-location`   | Chat sectioning — multi-location spanning (research) | High | Medium |
| `TASK-chat-flow-section-navigation`     | Chat flow — section navigation & story spanning UI  | Med  | Medium |
| `TASK-epic14-import-export-reconciliation` | Epic 14 reconciliation — already implemented | — | — |
| `TASK-epic11-admin-settings-reconciliation` | Epic 11 reconciliation — already implemented | — | — |
| `TASK-epic17-encryption-e2e-expansion`  | Encryption — e2e, asset encryption, access mgmt, key rotation | High | High |
| `TASK-encryption-architecture-clarification` | Encryption architecture — symmetric vs asymmetric models | High | High |
| `TASK-encryption-wire-message-pipeline` | Wire message pipeline — encrypt/decrypt on write/read | Med | High |
| `TASK-encryption-key-management-ui`     | Key management UI — view/generate/rotate/revoke keys | Med | High |
| `TASK-encryption-group-key-distribution`| Group key distribution — join/leave key handling | Med | High |
| `TASK-encryption-key-rotation`          | Key rotation — auto + manual, re-encrypt history | Med | Medium |
| `TASK-encryption-asset-encryption`      | Asset encryption — encrypt blobs, tier inheritance | Med | Medium |
| `TASK-encryption-access-management`     | Access management — time-based expiry, admin grants | Med | Medium |
| `TASK-encryption-browser-pre-encrypt`   | Browser pre-encrypt — wire existing browser.ts | Low–Med | Low |
| `TASK-conversation-branching`           | Conversation branching — tree-based chat history | Med | Medium |
| `TASK-character-relationships`          | Character relationships — inter-character bonds | Med | Medium |
| `TASK-prompt-library`                   | Prompt library — reusable prompt templates | Low–Med | Low |

## P3 — Deferred Concepts (Post-MVP)

| ID  | Concept                                                                 | Source Research                                                                                                                                            |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D.1 | Tool / Function Calling — 3-layer architecture                          | `docs/research/tool-calling-architecture.md`                                                                                                               |
| D.2 | BYOK — user brings own LLM / image-gen; admin can't read keys           | `docs/research/local-remote-inference-uis.md` §10.2                                                                                                        |
| D.3 | BYOR — user donates local compute as worker node                        | `docs/research/local-remote-inference-uis.md` §10.3                                                                                                        |
| D.4 | 3D World — world map, location travel, 3D avatars (Three.js)            | `docs/research/local-remote-inference-uis.md` §10.4 — see [docs/spec-planned/ideas/worlds-3d-navigation.md](../spec-planned/ideas/worlds-3d-navigation.md) |
| D.5 | Cross-Chat Autonomous Messages — characters message when "missing" user | `docs/research/local-remote-inference-uis.md` §10.1                                                                                                        |
| D.6 | Dual Runtime (Bun + Deno) — optional future                             | `docs/research/runtime-migration-bun-deno.md`                                                                                                              |
| D.7 | LLM native providers (Anthropic, Ollama, Bedrock)                       | `docs/spec/integrations/llm-serving.md`                                                                                                                    |
| D.8 | Image/Video Generation (sd.cpp, ComfyUI, Krea, Ideogram)                | `docs/spec/integrations/image-generation.md`                                                                                                               |
| D.9 | Full i18n implementation (868-line plan)                                | `docs/spec/i18n-implementation.md`                                                                                                                         |

## P4 — Long-term Vision

See `roadmap.md` P1/P2/P3 sections:

- Federated Identity, P2P modes, Marketplace, Analytics Suite
- DAO Governance, AI-Generated Content, XR/VR Integration
- Real-time Collaboration, Simulation Sandboxes, Edge Computing
- Quantum-Resistant Cryptography, Neuro-Symbolic AI

## Resolution Log

Items completed and merged to master:

- **Epic 12 (Memory Foundation)**: ✅ Complete — keyword filtering, type enum, context compaction, A/N injection implemented — merged to master
- **Epic 13 (Frontend Responsive)**: ✅ Complete — mobile breakpoints, touch targets, keyboard shortcuts, HTMX implemented — merged to master
- **Epic 19 (Chat Notifications)**: ✅ Complete — cross-chat SSE, read-state schema, unread badge, toast implemented — merged to master
- **Epic 10 (Generation Foundation)**: ✅ Complete — tool-call loop, provider failover, SSE reconnect implemented — merged to master
