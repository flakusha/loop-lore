# Backlog

Features and work items that are **not currently under active development**.
Items are categorized by priority and source. Plan.md tracks active work;
open-items.md tracks bugs/debt.

## P0 — Immediate Next (v0.2 In-Progress)

These have partial implementation in `src/`. Finishing them is the current
active work.

| Epic | Item                                                                                                                             | Source  | Status         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------- |
| 12   | Memory Foundation — keyword filtering, type enum, context compaction, A/N injection                                              | plan.md | 🟡 In progress |
| 13   | Frontend Responsive — mobile breakpoints, touch targets, keyboard shortcuts, HTMX search/filter, bulk actions, message archiving | plan.md | 🟡 In progress |
| 16   | Observability — telemetry, admin analytics, CI config, Playwright responsive tests                                               | plan.md | 🟡 In progress |
| 19   | Chat Notifications — cross-chat SSE, read-state schema, unread badge, toast                                                      | plan.md | 🟡 In progress |

## P1 — Next Cycle (v0.2 Not Started)

Fully specified, awaiting implementation.

| Epic | Item                                                                                         | Implementation Plan |
| ---- | -------------------------------------------------------------------------------------------- | ------------------- |
| 10   | Generation Foundation — tool-call loop, provider failover, SSE reconnect                     | plan.md Epic 10     |
| 11   | Admin & Settings — admin middleware, page routes, user prefs modal, plugin management        | plan.md Epic 11     |
| 14   | Import/Export — file-based character import, chat export, PNG steganography, bulk export     | plan.md Epic 14     |
| 15   | i18n & Accessibility — server-side i18n module, ARIA pass, keyboard nav, 10 locales          | plan.md Epic 15     |
| 17   | Encryption Foundation — AES-256-GCM, per-user keys via Argon2id, browser-side key derivation | plan.md Epic 17     |

## P2 — Specified, Not Implemented

Features described in spec docs but intentionally cut from v0 scope. Some have
partial shells; most have zero implementation.

| Feature                                                     | Spec                                                                              | Notes                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------- |
| Multi-format character import (PNG/YAML/TOML/CHARX)         | docs/spec/character-setup.md                                                      | Only JSON import works                   |
| Impersonation (`chat.impersonate_id`)                       | docs/spec/character-setup.md                                                      | Not implemented                          |
| RPG mechanics (dice, stats, combat, XP, loot)               | docs/spec/rpg-mechanics.md                                                        | `src/rpg/` does not exist                |
| Three-tier memory system (episodic/semantic/procedural)     | docs/spec/memory-system.md                                                        | Only `actor_memories` table exists       |
| Artifact system (code/docs/datasets as assets)              | docs/spec/artifacts-system.md                                                     | Not implemented                          |
| Agentic workspace mode                                      | docs/spec/use-case-agentic-workspace.md                                           | Not implemented                          |
| Client-side encryption (AES-256-GCM, key hierarchy)         | docs/frontend/encryption.md                                                       | Messages stored as plaintext             |
| Frontend story mode UI (GM panel, quest log, story chat)    | docs/frontend/chat/multi-llm-story.md                                             | Backend `src/story/` exists; no frontend |
| Message archiving (cascade, restore, purge)                 | docs/frontend/chat/archiving.md                                                   | Hard delete only                         |
| Memory selection UI (mid-chat panel, pinning, auto-extract) | docs/frontend/chat/memories.md                                                    | Backend reads memories; no UI            |
| Server-side i18n middleware (`req.t`)                       | docs/frontend/internationalization.md                                             | Minimal client-side `__()` only          |
| Anthropic/Ollama/Bedrock providers                          | docs/spec/provider-system.md                                                      | Only OpenAI-compatible exists            |
| Plugin management API (install/list/enable/disable)         | docs/spec/plugin-system.md                                                        | Plugin skeleton loads files; no API      |
| Signed URLs for asset downloads                             | docs/spec/assets.md                                                               | Uses `raw` endpoint with Bearer auth     |
| `POST /api/auth/register`                                   | docs/spec/auth-middleware.md                                                      | Not implemented                          |
| `/api/sessions` routes                                      | docs/spec/users-sessions.md                                                       | Not implemented                          |
| CSS skeleton shimmer, modal confirm dialogs, browser logger | docs/frontend/components.md                                                       | Uses native `confirm()` and text loading |
| Async background compression per upload                     | docs/spec/assets.md                                                               | Only build-time static compression       |
| S3/GCS object store backend                                 | docs/spec/assets.md                                                               | Local filesystem only                    |
| HTTP/2 and WebSocket in transport layer                     | docs/spec/transport-unified.md                                                    | Defined but not integrated into server   |
| Local inference (ComfyUI, llama-swap, sd.cpp)               | docs/spec/integrations/llm-serving.md, docs/spec/integrations/image-generation.md | Implemented in generation/providers/     |

## P3 — Deferred Concepts (Post-MVP)

From prior research. Full detail in source research docs; these entries are
tracking references.

| ID  | Concept                                                                   | Source Research                                   |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| D.1 | Tool / Function Calling — 3-layer architecture                            | docs/research/tool-calling-architecture.md        |
| D.2 | BYOK — user brings own LLM / image-gen; admin can't read keys but can ban | docs/research/local-remote-inference-uis.md §10.2 |
| D.3 | BYOR — user donates local compute as worker node                          | docs/research/local-remote-inference-uis.md §10.3 |
| D.4 | 3D World — world map, location travel, 3D avatars (Three.js)              | docs/research/local-remote-inference-uis.md §10.4 |
| D.5 | Cross-Chat Autonomous Messages — characters message when "missing" user   | docs/research/local-remote-inference-uis.md §10.1 |
| D.6 | Dual Runtime (Bun + Deno) — optional future                               | docs/research/runtime-migration-bun-deno.md       |
| D.7 | LLM native providers (Anthropic, Ollama, Bedrock)                         | docs/spec/integrations/llm-serving.md             |
| D.8 | Image/Video Generation (sd.cpp, ComfyUI, Krea, Ideogram)                  | docs/spec/integrations/image-generation.md        |
| D.9 | Full i18n implementation (868-line plan)                                  | docs/spec/i18n-implementation.md                  |

## P4 — Long-term Vision (roadmap.md)

See `docs/meta/roadmap.md` P1/P2/P3 sections. Items here are vision-level,
not specified:

- Federated Identity, P2P modes, Marketplace, Analytics Suite
- DAO Governance, AI-Generated Content, XR/VR Integration
- Real-time Collaboration, Simulation Sandboxes, Edge Computing
- Quantum-Resistant Cryptography, Neuro-Symbolic AI
