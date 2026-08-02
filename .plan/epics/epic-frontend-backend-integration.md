# EPIC: Frontend ↔ Backend Integration — Wiring Backend Subsystems to UI

**Status:** ⬜ Not Started
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
| **RPG Stats**                 | `/api/rpg/*` (dice, stats, combat, xp, loot)                                                                                                            | Mock data in `rpg-stats.ts` — no API call                              |
| **NSFW**                      | `/api/nsfw/*` (intimacy, desire, arousal, encounters, fantasies, moderation)                                                                            | No frontend at all — see `TASK-nsfw-frontend-integration.md`           |
| **Housing**                   | `/api/housing/*` (backend not yet implemented)                                                                                                          | Standalone domain — see `epic-housing.md` + `TASK-housing-frontend.md` |
| **Battle**                    | `/api/battle/*` (equipment, social, NPC, weather, resolution, morale)                                                                                   | No frontend at all                                                     |
| **Analytics**                 | `/api/analytics/*` (chat analytics, overview, comparisons, leaderboard)                                                                                 | No frontend — admin has its own stats                                  |
| **Blog**                      | `/api/blog/*` (posts, comments, follow, sources)                                                                                                        | No frontend at all                                                     |
| **Export Job**                | `/api/export`, `/api/export/download/:jobId`, `/api/export/status/:jobId`                                                                               | No frontend progress UI                                                |
| **Actor Sub-resources**       | `/api/actors/:actorId/traits`, `/relationships`, `/licensing`, `/availability`, `/emotion-avatars/*`, `/systems/*`, `/notes`, `/items`, `/lore-entries` | No frontend at all                                                     |
| **World Lore**                | `/api/worlds/:worldId/lore-entries`                                                                                                                     | No frontend at all                                                     |
| **Chat Pins**                 | `/api/chats/:id/pins*`                                                                                                                                  | No frontend at all                                                     |
| **Chat Transfers**            | `/api/chats/:id/transfer`                                                                                                                               | No frontend at all                                                     |
| **Chat Location**             | `/api/chats/:id/location`                                                                                                                               | No frontend at all                                                     |
| **Chat Story Turns**          | `/api/chats/:id/story-turns*`                                                                                                                           | No frontend at all                                                     |
| **Message Archive/Restore**   | `/api/messages/:id/archive`, `/restore`                                                                                                                 | No frontend at all                                                     |
| **Message Variants**          | `/api/messages/:id/variants`                                                                                                                            | `chat-variants.ts` uses `/variant` (singular) — partially wired        |
| **Message Quick Emojis**      | `/api/messages/quick-emojis`                                                                                                                            | No frontend at all                                                     |
| **Admin Character Overrides** | `/api/admin/character-overrides`                                                                                                                        | No frontend at all                                                     |
| **LoRA Discovery**            | `/api/lora/*` (discover, list, status, clear, validate)                                                                                                 | No frontend at all                                                     |
| **Sessions**                  | `/api/sessions`                                                                                                                                         | Server-internal only                                                   |

## Scope

### Phase 1 — Core Gameplay (P0)

| Task                                  | Priority | Status | Subsystem                                       |
| ------------------------------------- | -------- | ------ | ----------------------------------------------- |
| `TASK-rpg-stats-frontend-wiring.md`   | P0       | ⬜     | RPG — wire `rpg-stats.ts` to `/api/rpg/stats/*` |
| `TASK-battle-frontend-integration.md` | P0       | ⬜     | Battle — create battle screen + action selector |
| `TASK-nsfw-frontend-integration.md`   | P0       | ⬜     | NSFW — create intimacy + body state UI          |

> **Housing** is NOT part of Phase 1 NSFW — it is a standalone domain tracked under `epic-housing.md` with its own task `TASK-housing-frontend.md`.

### Phase 2 — Content & Analytics (P1)

| Task                                   | Priority | Status | Subsystem                                  |
| -------------------------------------- | -------- | ------ | ------------------------------------------ |
| `TASK-analytics-frontend-dashboard.md` | P1       | ⬜     | Analytics — chat cost + overview dashboard |
| `TASK-blog-frontend-authoring.md`      | P1       | ⬜     | Blog — post creation + comment UI          |
| `TASK-export-frontend-progress.md`     | P1       | ⬜     | Export — progress bar + download UI        |

### Phase 3 — Actor & World Sub-resources (P2)

| Task                                      | Priority | Status | Subsystem                                |
| ----------------------------------------- | -------- | ------ | ---------------------------------------- |
| `TASK-actor-traits-frontend.md`           | P2       | ⬜     | Traits — traits display + management     |
| `TASK-actor-relationships-frontend.md`    | P2       | ⬜     | Relationships — relationship map UI      |
| `TASK-actor-licensing-frontend.md`        | P2       | ⬜     | Licensing — license display              |
| `TASK-actor-availability-frontend.md`     | P2       | ⬜     | Availability — availability calendar     |
| `TASK-actor-emotion-avatars-frontend.md`  | P2       | ⬜     | Emotion Avatars — batch generation UI    |
| `TASK-actor-systems-export-frontend.md`   | P2       | ⬜     | Systems Export/Import — export/import UI |
| `TASK-actor-notes-items-lore-frontend.md` | P2       | ⬜     | Actor Notes/Items/Lore — CRUD UI         |
| `TASK-world-lore-entries-frontend.md`     | P2       | ⬜     | World Lore — lore browser                |

### Phase 4 — Chat Enhancements (P2)

| Task                                         | Priority | Status | Subsystem                                    |
| -------------------------------------------- | -------- | ------ | -------------------------------------------- |
| `TASK-chat-pins-frontend.md`                 | P2       | ⬜     | Pins — pin/unpin messages                    |
| `TASK-chat-transfer-frontend.md`             | P2       | ⬜     | Transfer — transfer chat ownership           |
| `TASK-chat-location-frontend.md`             | P2       | ⬜     | Location — set/view chat location            |
| `TASK-chat-story-turns-frontend.md`          | P2       | ⬜     | Story Turns — turn navigation                |
| `TASK-message-archive-restore-frontend.md`   | P2       | ⬜     | Archive/Restore — archive + restore messages |
| `TASK-message-quick-emojis-frontend.md`      | P2       | ⬜     | Quick Emojis — emoji reaction picker         |
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
