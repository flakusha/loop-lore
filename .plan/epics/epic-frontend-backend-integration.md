<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Frontend ↔ Backend Integration — Wiring Backend Subsystems to UI

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** 2026-10-04 audit — 13 of 21 catalogued subsystems verified wired (Discovery table + Audit section updated); epic reopened — 7 subsystems still lack a frontend consumer, 2 partially wired.
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** frontend, integration, wiring, backend, ui, alpine, htmx

## Summary

Backend subsystems exist with full API routes but no frontend UI. This epic tracks wiring each subsystem to the Alpine.js/htmx frontend so features are usable by end users.

## Discovery (2026-08-02)

Frontend review found **~150 frontend call sites** all resolve to real backend routes (zero broken wiring). However, a sizable set of backend routes have no frontend UI at all:

| Subsystem                     | Backend Routes                                                                                                                                          | Frontend Status                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **RPG Stats** | `/api/rpg/*` (dice, stats, combat, xp, loot) | Wired — `rpg-stats.ts` calls `/api/v1/rpg/stats/:actorId`, panel in character-info-panel (audited 2026-10-04) |
| **NSFW** | `/api/nsfw/*` (intimacy, desire, arousal, encounters, fantasies, moderation) | Intimacy/body-state UI still missing (only moderation endpoints wired) — see `TASK-nsfw-frontend-integration.md` |
| **Housing**                   | `/api/housing/*` (backend not yet implemented)                                                                                                          | Standalone domain — see `epic-housing.md` + `TASK-housing-frontend.md` |
| **Battle**                    | `/api/battle/*` (equipment, social, NPC, weather, resolution, morale)                                                                                   | No frontend at all                                                     |
| **Analytics** | `/api/analytics/*` (chat analytics, overview, comparisons, leaderboard) | Wired — admin analytics dashboard (`admin-analytics.ts`, admin.html tab); comparisons/leaderboard still unwired (audited 2026-10-04) |
| **Blog** | `/api/blog/*` (posts, comments, follow, sources) | Wired — reader + authoring UI (`blog.ts`, blog.html); moderation/follower UI open (audited 2026-10-04) |
| **Export Job** | `/api/export`, `/api/export/download/:jobId`, `/api/export/status/:jobId` | Wired — progress + download UI (`export-progress.ts`, settings export panel) (audited 2026-10-04) |
| **Actor Sub-resources** | `/api/actors/:actorId/traits`, `/relationships`, `/licensing`, `/availability`, `/emotion-avatars/*`, `/systems/*`, `/notes`, `/items`, `/lore-entries` | Wired: traits, licensing, emotion-avatars, systems export/import, notes/items/lore-entries; missing: relationships (mock data in npc.ts), availability (audited 2026-10-04) |
| **World Lore**                | `/api/worlds/:worldId/lore-entries`                                                                                                                     | No frontend at all                                                     |
| **Chat Pins** | `/api/chats/:id/pins*` | Wired — pins panel (`chat-pins.ts`, pins-panel.html) |
| **Chat Transfers** | `/api/chats/:id/transfer` | Wired — ownership transfer (`chat-settings/ownership.ts`) |
| **Chat Location** | `/api/chats/:id/location` | Wired — location panel (`chat-location.ts`, location-panel.html) |
| **Chat Story Turns** | `/api/chats/:id/story-turns*` | Wired — turn list (`story-state/api.ts`); single-turn navigation open |
| **Message Archive/Restore** | `/api/messages/:id/archive`, `/restore` | Wired — `message-archive.ts` + archive-confirm modal |
| **Message Variants** | `/api/messages/:id/variants` | Wired — GET `/variants` + PUT `/variant` both match backend routes; earlier "singular mismatch" note stale (audited 2026-10-04) |
| **Message Quick Emojis** | `/api/messages/quick-emojis` | Reaction picker wired (message-list.html); `/api/messages/quick-emojis` preference endpoint still has no frontend |
| **Admin Character Overrides** | `/api/admin/character-overrides`                                                                                                                        | No frontend at all                                                     |
| **LoRA Discovery**            | `/api/lora/*` (discover, list, status, clear, validate)                                                                                                 | No frontend at all                                                     |
| **Sessions**                  | `/api/sessions`                                                                                                                                         | Server-internal only                                                   |

## Backend → Frontend Mapping (from reconciliation-frontend-ux.md)

### World & Locations System

| Backend Component | Frontend Requirement                  | Status         | Priority |
| ----------------- | ------------------------------------- | -------------- | -------- |
| World CRUD        | World management UI                   | ⬜ Not Started | High     |
| Location CRUD     | Location explorer UI                  | ✅ Done (2026-08-22, feature/location-explorer-ui) | High     |
| Travel system     | Travel UI (route selection, progress) | ⬜ Not Started | High     |
| Time tracking     | Time display widget                   | ⬜ Not Started | Medium   |
| NPC placement     | NPC location display                  | ⬜ Not Started | Medium   |
| Random encounters | Encounter UI                          | ⬜ Not Started | Medium   |
| Diplomacy system  | Faction relations UI                  | ⬜ Not Started | Low      |

**Missing Frontend Epics:**

- `epic-world-management-ui` — World/location CRUD, explorer, map view
- `epic-travel-ui` — Route selection, progress tracking, fast travel
- `epic-npc-management-ui` — NPC viewer, relationship map, memory browser

### Battle & Action Systems

| Backend Component    | Frontend Requirement            | Status         | Priority |
| -------------------- | ------------------------------- | -------------- | -------- |
| Battle state         | Battle UI (health bars, status) | ⬜ Not Started | High     |
| Turn-based mechanics | Turn order display              | ⬜ Not Started | High     |
| Battle actions       | Action selection UI             | ⬜ Not Started | High     |
| Battle log           | Battle history viewer           | ⬜ Not Started | Medium   |

## Scope

### Phase 1 — Core Gameplay (P0)

| Task                                  | Priority | Status | Subsystem                                       |
| ------------------------------------- | -------- | ------ | ----------------------------------------------- |
| `TASK-rpg-stats-frontend-wiring.md`   | P0       | 🔶 In Progress | RPG — wire `rpg-stats.ts` to `/api/rpg/stats/*` |
| `TASK-battle-frontend-integration.md` | P0       | ⬜     | Battle — create battle screen + action selector |
| `TASK-nsfw-frontend-integration.md`   | P0       | ⬜     | NSFW — create intimacy + body state UI          |

> **Housing** is NOT part of Phase 1 NSFW — it is a standalone domain tracked under `epic-housing.md` with its own task `TASK-housing-frontend.md`.

### Phase 2 — Content & Analytics (P1)

| Task                                   | Priority | Status | Subsystem                                  |
| -------------------------------------- | -------- | ------ | ------------------------------------------ |
| `TASK-analytics-frontend-dashboard.md` | P1       | 🔶 In Progress | Analytics — chat cost + overview dashboard |
| `TASK-blog-frontend-authoring.md`      | P1       | 🔶 In Progress | Blog — post creation + comment UI          |
| `TASK-export-frontend-progress.md`     | P1       | ✅ Done | Export — progress bar + download UI        |

### Phase 3 — Actor & World Sub-resources (P2)

| Task                                      | Priority | Status | Subsystem                                |
| ----------------------------------------- | -------- | ------ | ---------------------------------------- |
| `TASK-actor-traits-frontend.md`           | P2       | ✅ Done | Traits — traits display + management     |
| `TASK-actor-relationships-frontend.md`    | P2       | ⬜     | Relationships — relationship map UI      |
| `TASK-actor-licensing-frontend.md`        | P2       | ✅ Done | Licensing — license display              |
| `TASK-actor-availability-frontend.md`     | P2       | ⬜     | Availability — availability calendar     |
| `TASK-actor-emotion-avatars-frontend.md`  | P2       | ✅ Done | Emotion Avatars — batch generation UI    |
| `TASK-actor-systems-export-frontend.md`   | P2       | ✅ Done | Systems Export/Import — export/import UI |
| `TASK-actor-notes-items-lore-frontend.md` | P2       | ✅ Done | Actor Notes/Items/Lore — CRUD UI         |
| `TASK-world-lore-entries-frontend.md`     | P2       | ⬜     | World Lore — lore browser                |

### Phase 4 — Chat Enhancements (P2)

| Task                                         | Priority | Status | Subsystem                                    |
| -------------------------------------------- | -------- | ------ | -------------------------------------------- |
| `TASK-chat-pins-frontend.md`                 | P2       | ✅ Done | Pins — pin/unpin messages                    |
| `TASK-chat-transfer-frontend.md`             | P2       | ✅ Done | Transfer — transfer chat ownership           |
| `TASK-chat-location-frontend.md`             | P2       | ✅ Done | Location — set/view chat location            |
| `TASK-chat-story-turns-frontend.md`          | P2       | 🔶 In Progress | Story Turns — turn navigation                |
| `TASK-message-archive-restore-frontend.md`   | P2       | ✅ Done | Archive/Restore — archive + restore messages |
| `TASK-message-quick-emojis-frontend.md`      | P2       | ✅ Done (picker) | Quick Emojis — emoji reaction picker         |
| `TASK-admin-character-overrides-frontend.md` | P2       | ⬜     | Admin Overrides — override management UI     |

## Implementation Strategy

1. **Start with Phase 1** — highest-impact subsystems (RPG, Battle, NSFW)
2. **Phase 2** — analytics, blog, export (content-related)
3. **Phase 3** — actor sub-resources (character detail enrichment)
4. **Phase 4** — chat enhancements (message management)

Each phase follows the pattern:

1. Verify backend route exists and returns correct data
2. Create Alpine component (`alpine/<subsystem>.ts`)
3. Create HTML template (`components/<subsystem>.html`)
4. Register in `alpine/index.ts`
5. Wire to chat state or page
6. Add tests for frontend components

## Shared Components

| Component            | Used By               | Notes                       |
| -------------------- | --------------------- | --------------------------- |
| Health bar widget    | Battle, NSFW, RPG     | Reusable across systems     |
| Status effect badges | Battle, NSFW, Disease | Shared buff/debuff display  |
| Action button grid   | Battle, NSFW          | Similar action selection    |
| Dice roll animation  | Battle, RPG           | Reusable for all dice rolls |
| Progress bar         | Export, Analytics     | Shared progress display     |

## Acceptance Criteria

- [ ] All Phase 1 subsystems have frontend UI
- [ ] All Phase 2 subsystems have frontend UI
- [ ] All Phase 3 subsystems have frontend UI
- [ ] All Phase 4 subsystems have frontend UI
- [ ] All frontend components follow existing Alpine.js patterns
- [ ] All frontend components handle auth via `apiFetch`/`feFetch`
- [ ] All frontend components handle 401 via existing redirect
- [ ] No broken wiring (all frontend calls map to real backend routes)
- [ ] Tests pass for all new components

## Audit (2026-10-04)

Repo-state audit to avoid re-implementing existing functionality. Verdicts grounded in `feFetch`/`apiFetch` call-site evidence:

| Subsystem | Verdict | Evidence |
| --- | --- | --- |
| RPG stats | Wired | `src/frontend/alpine/rpg-stats.ts:45` → `/api/v1/rpg/stats/:actorId`, rendered in `character-info-panel.html` |
| Battle | Missing | no frontend consumer of `/api/battle/*` |
| NSFW intimacy/body | Missing | only moderation endpoints wired (`admin-review.ts`, `chat-utils/interaction.ts`, settings) |
| Analytics | Wired (core) | `admin-analytics.ts:64-66`, `admin.html:1609-1770`; comparisons/leaderboard unwired |
| Blog | Wired (core) | `blog.ts` + `blog.html`; moderation/follower UI open |
| Export | Wired | `export-progress.ts:139,154,169,230` + settings panel |
| Actor traits/licensing/emotion-avatars/systems/notes/items/lore | Wired | `actor-traits.ts`, `actor-licensing.ts`, `actor-emotion-avatars.ts`, `actor-systems.ts`, `actor-entities.ts` via `character-panels-section.ts` |
| Actor relationships | Missing | `npc.ts` renders `MOCK_RELATIONSHIPS`, no API call |
| Actor availability | Missing | no frontend consumer of `/api/actors/:id/availability` |
| World lore entries | Missing | no frontend consumer of `/api/worlds/:id/lore-entries` |
| Chat pins/transfer/location | Wired | `chat-pins.ts`, `chat-settings/ownership.ts`, `chat-location.ts` |
| Chat story turns | Wired (list) | `story-state/api.ts:55`; single-turn nav open |
| Message archive/restore | Wired | `message-archive.ts:22,50` |
| Message variants | Wired | `chat-variants.ts:29` GET `/variants` + `:68` PUT `/variant` — both match backend; earlier "singular mismatch" note stale |
| Message quick emojis | Wired (picker) | reaction chips + picker in `message-list.html`; `/api/messages/quick-emojis` preference endpoint unfetched (separate gap; its ticket's scope was picker-only) |
| Admin character overrides | Missing | no frontend consumer |
| LoRA discovery | Missing | no frontend consumer |

**Epic status ruling:** `Done` was inaccurate — 7 subsystems still lack a frontend consumer (battle, NSFW intimacy/body, relationships, availability, world lore, admin overrides, LoRA) and analytics/blog/story-turns are partially wired. Reopened to In Progress.

**Ticket corrections this audit:** `TASK-rpg-stats-frontend-wiring.md` (implemented core, stale mock-data claim — In Progress), `TASK-analytics-frontend-dashboard.md` (dashboard landed — In Progress), `TASK-chat-story-turns-frontend.md` (list endpoint wired — In Progress). `TASK-message-quick-emojis-frontend.md` stays Done — its scope was the reaction picker, which is wired; the unfetched `/api/messages/quick-emojis` preference endpoint is a separate, unfiled gap.

## Related Epics

- `epic-rpg-mechanics.md` — Backend RPG systems
- `epic-battle-ui.md` — Battle UI
- `epic-nsfw-ui.md` — NSFW UI
- `epic-housing.md` — Housing system (standalone domain, own UI)
- `epic-analytics-observability.md` — Analytics
- `epic-blog-system.md` — Blog
- `epic-battle-integration-gaps.md` — Battle integration
- `epic-nsfw-integration-gaps.md` — NSFW integration
- `epic-frontend-overview.md` — Frontend overview

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| FE-BE Harmonization | Static `feFetch` ↔ route/schema contract index | Proves this epic's "no broken wiring" acceptance |
| Frontend Components | Shared composer/partial building blocks | Reused by each newly wired subsystem screen |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Routing, Gallery, Admin, Notifications, Settings, Chat Commands, Emoji Reactions | `feFetch` wiring pattern + backend route map | Each wires its UI to the routes this epic catalogues |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `feFetch` call-site descriptor (`src/frontend/fe-fetch.ts`) | FE-BE Harmonization | Method + normalized path join key |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| — | — | Server-rendered htmx request/response only; no cross-system event bus |

**Resolved:** 2026-10-04 registry-driven close: git issue bd5eaa3 (registry tip: 5e6ceed69 Konstantin Fedotov Close issue)
