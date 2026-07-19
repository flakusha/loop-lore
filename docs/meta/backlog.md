# Backlog

Features not under active development. `plan.md` tracks active work; `open-items.md` tracks bugs/debt.

## P0 — Immediate Next (v0.1 In-Progress)

Partial implementation exists in `src/`. Finishing these is current active work.

| Epic | Item                                                                               | Source  | Status         |
| ---- | ---------------------------------------------------------------------------------- | ------- | -------------- |
| 16   | Observability — telemetry, admin analytics, CI config, Playwright responsive tests | plan.md | 🟡 In progress |

### Completed (moved from P0)

| Epic | Item                                                                                   | Status      |
| ---- | -------------------------------------------------------------------------------------- | ----------- |
| 12   | Memory Foundation — keyword filtering, type enum, context compaction, A/N injection    | ✅ Complete |
| 13   | Frontend Responsive — mobile breakpoints, touch targets, keyboard shortcuts, HTMX, etc | ✅ Complete |
| 19   | Chat Notifications — cross-chat SSE, read-state schema, unread badge, toast            | ✅ Complete |

## P1 — Next Cycle (v0.1 Not Started)

Ordered by user impact × effort. Items with partial `src/` code listed first.

| Epic | Item                                                                                  | Effort | Partial Code? | plan.md ref |
| ---- | ------------------------------------------------------------------------------------- | ------ | ------------- | ----------- |
| 14   | Import/Export — file-based character import, chat export, PNG steganography, bulk     | Low    | Yes           | Epic 14     |
| 11   | Admin & Settings — admin middleware, page routes, user prefs modal, plugin management | Med    | Yes           | Epic 11     |
| 17   | Encryption Foundation — AES-256-GCM, per-user keys, browser-side key derivation       | Med    | Yes           | Epic 17     |
| 10   | Generation Foundation — tool-call loop, provider failover, SSE reconnect              | Med    | ✅ Complete   | Epic 10     |
| 15   | i18n & Accessibility — server-side i18n module, ARIA pass, keyboard nav, 10 locales   | High   | Minimal       | Epic 15     |

## P2 — Specified, Not Implemented

| Feature                                                     | Spec                                                                    | Notes                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Multi-format character import (PNG/YAML/TOML/CHARX)         | `docs/spec/character-setup.md`                                          | Only JSON import works                                                             |
| Impersonation (`chat.impersonate_id`)                       | `docs/spec/character-setup.md`                                          | Not implemented                                                                    |
| RPG mechanics (dice, stats, combat, XP, loot)               | `docs/spec/rpg-mechanics.md`, `docs/spec/rpg-implementation-roadmap.md` | `src/rpg/` does not exist                                                          |
| Three-tier memory system (episodic/semantic/procedural)     | `docs/spec/memory-system.md`                                            | Only `actor_memories` table exists                                                 |
| Artifact system (code/docs/datasets as assets)              | `docs/spec/artifacts-system.md`                                         | Not implemented                                                                    |
| Agentic workspace mode                                      | `docs/spec/use-case-agentic-workspace.md`                               | Not implemented                                                                    |
| Client-side encryption (AES-256-GCM, key hierarchy)         | `docs/frontend/encryption.md`, `docs/spec/encryption-workflow.md`       | Messages stored as plaintext                                                       |
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

| #   | Feature                          | Effort | Business Value | Source               |
| --- | -------------------------------- | ------ | -------------- | -------------------- |
| Q1  | Regex output transforms          | Low    | High           | feature-analysis #6  |
| Q2  | Smart-regen transforms (polish)  | Low    | High           | feature-analysis #8  |
| Q3  | Conversation analytics dashboard | Low    | Med            | feature-analysis #27 |
| Q4  | Model-comparison dashboard       | Low    | Med            | feature-analysis #28 |
| Q5  | Bulk data export (zip-all)       | Low    | Med            | plan Epic 14         |

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
