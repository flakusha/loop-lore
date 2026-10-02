<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: GM Notes, Shadow Notes, Quests, Dev-Visible Carriage

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


 **Status Note:** All 6 ACs green — final AC (moderator/GM re-eval) verified against src + scoped tests 2026-10-01.
 **Status:** Done (2026-10-01)
**Priority:** Low
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Provide three GM-tier annotation surfaces inside a chat: public notes, shadow notes (visible only to GM / designated observers), and quests. Add a dev-visible "carriage" channel for cross-context state carried between sections, parties, and sessions, never surfacing to end users.

## Acceptance Criteria

- [x] `note` / `shadow_note` / `quest` annotations persist per chat with proper shareability controls
- [x] Shadow notes are excluded from non-GM views at every render site
- [x] Carriage record is visible to admins and developers but never to regular participants
- [x] Annotations propagate under the existing context window and memory-shareability rules
- [x] Quest state transitions (open / completed / failed) emit memory events
- [x] `src/memory/shareability.ts` correctly gates shadow notes out of shared recall


## Verification (2026-10-01)

- **AC1** — annotations vertical slice: `src/chat/proactive/annotations.ts` + `src/routes/chats/annotations.ts` (chat-scoped access, kind validation, shadow persisted to `shadow_notes`, notes/quests TTL-scoped). Tests: `src/chat/proactive/annotations.test.ts`, `src/routes/chats/annotations*.test.ts`.
- **AC2** — closed this session: the annotations GET route returned shadow rows to any chat
  participant; now gated behind `checkChatSettingsAccess` (creator / owner / GM /
  admin). Regression: `annotations.coverage.test.ts` "AC2: a plain member never sees
  shadow notes" (member view excludes shadows, creator view includes them).
- **AC3** — new carriage channel: `src/chat/service/carriage.ts` (append/list over the
  `carriage_records` table, migration `028_carriage_records`, scopes
  `section`/`party`/`session`; FK ON DELETE SET NULL so records survive source-chat
  deletion) + admin listing `GET /api/admin/chats/:id/carriage`
  (`src/routes/admin/carriage.ts`: admins see records, non-admins 403, unknown chat
  404; the participant annotations endpoint never returns carriage payloads).
  Emitters wired best-effort in `carryLocation` / `splitParty` / `migrateChat`.
  Tests: `src/chat/service/carriage.test.ts` (8), `src/routes/admin/carriage.test.ts` (4).
- **AC4** — gm-notes prompt section injects shadow/notes under context + shareability
  rules (`src/assistant/prompt/sections/gm-notes.ts`, tests `gm-notes.test.ts`).
- **AC5** — `transitionQuestStatus` / `applyProgress` / `createQuest` / `QuestEngine` now
  emit `memory.quest.opened|completed|failed` into the telemetry events sink
  (`src/memory/events.ts`, wired in `src/story/quest-engine/{lifecycle,progress}.ts`,
  `src/story/shared/quest-engine-utils.ts`). Tests: `src/memory/events.test.ts`.
- **AC6** — recall loaders never read `shadow_notes` (grep: 0 coupling in `src/memory/`);
  regression `src/memory/shadow-recall.test.ts` proves `fetchActorMemories` returns
  committed memories and never shadow content.

## Related Tickets / Epics

- epic-chat-product-features
- epic-gm-shadow-notes
- TASK-gm-whitenotes
- TASK-gm-shadow-notes

## Files

- `src/chat/proactive/types.ts`
- `src/chat/proactive/db-helpers.ts`
- `src/chat/service/carry-history.ts`
- `src/chat/service/party-narration.ts`
- `src/memory/shareability.ts`

## Open Questions

- Does carriage carry across chat transitions, or only across section splits within a chat?
- Should shadow notes be exportable by GM as a transcript?

**Resolved:** 2026-10-02 registry-driven close: git issue 8d605de (registry tip: 16de0ced6 gate Auto-closed: appended .md marker marks TASK-CHAT-FEATURE-NOTES-SHADOW-CARRIAGE done)
