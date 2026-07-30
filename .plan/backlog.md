# Backlog

> **Last updated:** 2026-07-31 — Post-reconciliation priorities; P0/P1/P1.5 status synced with validated code state
> Features not under active development. `immediate.md` tracks active work; `docs/meta/open-items.md` tracks bugs/debt.

## P0 — Critical Path (Blocking)

| Epic | Item                                                                      | Effort | Status      |
| ---- | ------------------------------------------------------------------------- | ------ | ----------- |
| 27   | Data Integrity Phase 1 — config guards, backend selection, doc correction | Low    | ✅ Complete |
| —    | NSFW Moderation Safety Infrastructure — gate, consent, audit, flagging    | Medium | ✅ Complete |
| —    | Shared Schemas — Reputation, Consent, NSFW Content Rating                 | Medium | ✅ Complete |

## P1 — High Priority (Post-P0)

| Epic | Item                                                              | Effort | Status      |
| ---- | ----------------------------------------------------------------- | ------ | ----------- |
| —    | NSFW Integration Gaps — Housing, Weather, Social, Disease         | Medium | ✅ Complete |
| —    | Battle Integration Gaps — Items, Social, NPC, Weather, Resolution | High   | ✅ Complete |
| 27   | Data Integrity Phase 2 — `data_version` optimistic concurrency    | Medium | ✅ Complete |

## P2 — Core Gameplay Systems (Post-P1)

| Feature                                                 | Spec                                  | Effort    | Status         |
| ------------------------------------------------------- | ------------------------------------- | --------- | -------------- |
| RPG mechanics (dice, stats, combat, XP, loot)           | `docs/spec/rpg-mechanics.md`          | Very High | ⬜ Not Started |
| Character multi-personality (switching, locking)        | `TASK-character-multi-personality.md` | Medium    | ⬜ Not Started |
| Mood swings & happiness meter                           | `TASK-character-mood-happiness.md`    | Medium    | 🟡 In Progress |
| Memory injection probability & privacy                  | `TASK-character-memory-injection.md`  | Medium    | ✅ Done        |
| Three-tier memory system (episodic/semantic/procedural) | `docs/spec/memory-system.md`          | Large     | 🟡 In Progress |
| World & Locations (discovery, travel, NPC)              | `epic-world-locations.md`             | Very High | ⬜ Not Started |

## P3 — Advanced Features (Post-P2)

| Feature                                                | Spec                                      | Effort      | Status         |
| ------------------------------------------------------ | ----------------------------------------- | ----------- | -------------- |
| Artifact system (code/docs/datasets as assets)         | `docs/spec/artifacts-system.md`           | Medium      | ⬜ Not Started |
| Visual novel mode (image + text overlay)               | `docs/frontend/chat/visual-novel-mode.md` | Medium-High | ⬜ Not Started |
| Plugin system & extensibility                          | `epic-plugin-system.md`                   | Very High   | ⬜ Not Started |
| ComfyUI Plugin & Workflow Templates                    | `epic-comfyui-plugin.md`                  | High        | ⬜ Not Started |
| Provider & Plugin Ecosystem (Anthropic/Ollama/Bedrock) | `epic-provider-plugin-ecosystem.md`       | Large       | ⬜ Not Started |

## P4 — Specified, Not Implemented

| Feature                                                     | Spec                                          | Notes                                                                |
| ----------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| RAG & Document Processing (Enterprise Knowledge Management) | `epic-rag-document-processing.md`             | Ingestion, embedding, vector search, compliance                      |
| Communications Integrations (Matrix, XMPP, IM, Email)       | `epic-communications-integrations.md`         | Federation, E2EE, bridges                                            |
| Social Hub (Messengers, Social Networks, Email)             | `epic-social-hub.md`                          | Cross-platform adapters, Nostr, AT Protocol                          |
| Anonymity & Decentralization (Tor, I2P, Mesh, BYOK)         | `epic-anonymity-decentralization.md`          | Anonymous access, P2P resource sharing                               |
| Security & Sandboxing (LLM, Testing, Escape Prevention)     | `epic-security-sandboxing.md`                 | LLM sandboxing, prompt injection defense                             |
| API Governance (OpenAPI, Validation, Rate Limiting)         | `epic-api-governance.md`                      | OpenAPI spec, rate limiting, telemetry                               |
| API/Library Distribution Mode                               | `epic-api-library-distribution.md`            | OpenAPI spec, headless mode, npm packages                            |
| Multi-format character import (PNG/YAML/TOML/CHARX)         | `docs/spec/character-spec.md`                 | Only JSON import works                                               |
| Impersonation (`chat.impersonate_id`)                       | `docs/spec/character-spec.md`                 | Not implemented                                                      |
| Three-tier memory system                                    | `docs/spec/memory-system.md`                  | Only `actor_memories` table exists                                   |
| Client-side encryption (AES-256-GCM, key hierarchy)         | `docs/frontend/encryption.md`                 | ✅ Partial — browser crypto exists; messages stored as plaintext     |
| Frontend story mode UI (GM panel, quest log)                | `docs/frontend/chat/multi-llm-story.md`       | Backend `src/story/` exists; no frontend                             |
| Message archiving (cascade, restore, purge)                 | `docs/frontend/chat/archiving.md`             | Hard delete only                                                     |
| Memory selection UI (mid-chat panel, pinning)               | `docs/frontend/chat/memories.md`              | Backend reads memories; no UI                                        |
| Server-side i18n middleware (`req.t`)                       | `docs/frontend/internationalization.md`       | Minimal client-side `__()` only                                      |
| Anthropic/Ollama/Bedrock providers                          | `docs/spec/provider-system.md`                | Only OpenAI-compatible exists                                        |
| Plugin management API (install/list/enable/disable)         | `docs/spec/plugin-system.md`                  | Plugin skeleton loads files; no API                                  |
| Signed URLs for asset downloads                             | `docs/spec/assets.md`                         | Uses `raw` endpoint with Bearer auth                                 |
| `POST /api/auth/register`                                   | `docs/spec/auth-middleware.md`                | Not implemented                                                      |
| `/api/sessions` routes                                      | `docs/spec/users-sessions.md`                 | Not implemented                                                      |
| Notification system with noise filtering                    | `docs/spec/notifications-expansion.md`        | Basic toasts exist                                                   |
| Model comparison reactions                                  | `docs/spec/notifications-expansion.md`        | Reactions table exists; no comparison API                            |
| Assistant `/commands` extension                             | `docs/spec/assistant-commands.md`             | Command parser exists; no slash commands wired                       |
| Combined filter support                                     | `docs/spec/filtering-pagination.md`           | Single filter only                                                   |
| Chat room search & join                                     | `docs/frontend/chat/search-and-filter.md`     | `TASK-chat-room-search-join.md`                                      |
| Chat room filters                                           | `docs/frontend/chat/search-and-filter.md`     | `TASK-chat-room-filters.md`                                          |
| Chat message search & filter                                | `docs/frontend/chat/search-and-filter.md`     | `TASK-chat-message-search.md`                                        |
| Chat autorenaming                                           | `docs/frontend/chat/overview.md`              | `TASK-chat-autorenaming.md`                                          |
| Visual novel mode                                           | `docs/frontend/chat/visual-novel-mode.md`     | `TASK-visual-novel-mode.md` — backend complete, frontend not started |
| 3D view modes                                               | `TASK-3d-view-modes.md`                       | Consolidated from 3 old tasks                                        |
| Text effects & overlays                                     | `docs/frontend/chat/text-effects-overlays.md` | `TASK-text-effects-overlays.md`                                      |
| Info bubbles                                                | `TASK-info-bubbles.md`                        | `epic-immersion-presentation.md`                                     |
| Character multi-personality                                 | `TASK-character-multi-personality.md`         | Mood system needs personality switching                              |
| Mood swings & happiness meter                               | `TASK-character-mood-happiness.md`            | Happiness affects personality/dialogue                               |
| Memory injection probability & privacy                      | `TASK-character-memory-injection.md`          | Privacy levels, comfort-based sharing                                |
| Chat external music linking                                 | `TASK-chat-external-music-linking.md`         | Browser-native embeds                                                |
| Character NSFW content rating                               | `epic-character-core-system.md`               | 5-tier rating; no runtime enforcement                                |
| Character permanent traits (Layer 0)                        | `epic-character-core-system.md`               | Immutable personality; PROHIBITS personality change                  |
| Character world/location traits (Layer 2)                   | `epic-character-core-system.md`               | Contextual trait overrides                                           |
| Character licensing (CC0 to all_rights)                     | `epic-character-core-system.md`               | Creator-controlled OR public domain                                  |
| Character multi-avatar system                               | `epic-character-core-system.md`               | Context/mood/action-aware avatars                                    |

## Completed (moved from P0/P1/P1.5)

| Epic | Item                                                                        | Status                                                |
| ---- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| 12   | Memory Foundation — keyword filtering, type enum, context compaction        | ✅ Complete                                           |
| 13   | Frontend Responsive — mobile breakpoints, touch targets, keyboard shortcuts | ✅ Complete                                           |
| 19   | Chat Notifications — cross-chat SSE, read-state schema, unread badge        | ✅ Complete                                           |
| 10   | Generation Foundation — tool-call loop, provider failover, SSE reconnect    | ✅ Complete                                           |
| 11   | Admin & Settings — admin middleware, page routes, user prefs modal          | ✅ Complete (core)                                    |
| 17   | Client-Side Encryption — AES-256-GCM, browser crypto, key hierarchy         | ✅ Partial (browser crypto done; integration pending) |
| 14   | Import/Export — file-based character import, chat export                    | ✅ Partial (JSON import works; PNG/CHARX pending)     |
| —    | Accessibility P1.5 — focus traps, aria-live, reduced-motion, contrast, touch | ✅ Complete (2026-07-31)                             |

## Reconciliation Notes

- **135 issues reconciled** (2026-07-28) — backlog/roadmap now reflect actual implementation state
- **Epic 11 (Admin & Settings)** marked complete (core) — expansion items tracked separately
- **Epic 17 (Encryption)** marked partial — browser crypto done, integration pending
- **Epic 14 (Import/Export)** marked partial — JSON import works, other formats pending
- **Epic 16 (Observability)** moved from P0 to completed — already implemented
- **New P0 priorities** added: Data Integrity Phase 1, NSFW Moderation, Shared Schemas
- **2026-07-30 status sync**: P0 NSFW Moderation → 🟡 Partial; P0 Shared Schemas → ✅ Complete; P1 NSFW Integration Gaps → ✅ Complete; P1 Battle Integration Gaps → ✅ Complete; P1 Data Integrity Phase 2 → ✅ Complete; P1 Memory Tiers Wiring was already ✅ Complete in Completed section
- **2026-07-30 consistency fixes**: Mood swings & happiness meter → 🟡 In Progress (per TASK-character-mood-happiness.md); Memory injection probability & privacy → ✅ Done (per TASK-character-memory-injection.md); Three-tier memory system → 🟡 In Progress (per FEAT-memory-systems-three-tier.md); Removed non-existent `docs/spec/rpg-implementation-roadmap.md` from RPG mechanics spec reference
