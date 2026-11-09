<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: server-side room-filter enforcement

**Status:** Done
**Priority:** low
**Effort:** Small
**Epic:** epic-chat-lifecycle-moderation
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Room filters exist client-side only. Evidence:

- Filter state (type/status/sort/world/minMessages/maxMessages/updatedSince)
  lives in `src/frontend/alpine/chat-filters.ts`, persisted in localStorage
  under `chat-sidebar-filters` (`STORAGE_KEY` at chat-filters.ts:22;
  restore/persist noted in the header comment at :14-18) and converted into
  query params for GET /api/v1/chats (:6-9).
- The server honors those params per request (`src/routes/chats/list.ts:141-218`
  applies type/archived/world/updatedSince/min-maxMessages/sort) but stores
  nothing: no per-user filter rows exist, so filters are device-local and any
  server-driven surface (feeds, exports, digests) cannot honor a user's
  filters.
- The message read path applies access + pagination + parentId only
  (`src/routes/messages/read.ts:48-114` — GET /chats/:id/messages); grep for
  `room-filter|roomFilter|room_filter` across `src/chat` returns zero matches.
- Epic box: `.plan/epics/epic-chat-lifecycle-moderation.md:159` —
  "🟡 partial — frontend `chat-filters.ts` shipped; server-side filter API
  pending".

This is a UX choice, not a security bug: display-only client-side filtering
is legitimate. Server-side enforcement enables future server-driven feeds
and exports honoring filters — a capability gap, not a vulnerability fix.

## Scope

Smaller slice only: persisted per-user room-filter rows + application in the
list query. Explicit query params sent by the client stay authoritative;
persisted rows act as the server-known default when params are absent. Rows
follow the filter dimensions already shipped client-side
(`src/frontend/alpine/chat-filters.ts`) rather than inventing new ones.
Display-only filtering in the message read path stays client-authoritative
(out of scope).

**Acceptance Criteria:**

- [x] Per-user room-filter rows persisted server-side (schema/migration + persistence surface)
- [x] List endpoint honors persisted rows when explicit params are absent; explicit params win when present
- [x] Client keeps sending filters and remains authoritative for display-only filtering
- [x] Tests covering persistence, precedence, and list-query application

## Files

- `src/db/schema.ts` + migration — per-user room-filter rows
- `src/routes/chats/list.ts` — application in the list query
- persistence route/service for the filter rows

## Related

- TASK-chat-room-filters (frontend half shipped; the query-param half of its
  Phase 4 has landed in `src/routes/chats/list.ts` — this ticket is the
  remaining server-side persistence slice)
- Epic: epic-chat-lifecycle-moderation — Chat room filters box (🟡)

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance evidence** (branch `feat-room-filters-server` @ d7c402b70):

- Migration `src/db/migrations/098_chat_list_filters.ts` creates per-user
  `chat_list_filters` rows (number 098 verified free on dev).
- `src/routes/chats/filters.ts` mounts `GET/PUT /api/v1/chats/filters`
  (`loadChatListFilters` + `resolveChatListFilters` merge: explicit query
  params win, persisted snapshot is the default); `src/routes/chats/list.ts`
  applies the resolved filters in the list query.
- `src/frontend/alpine/chat-filters-server.ts` keeps sending explicit
  filters (client remains display-authoritative).
- `src/routes/chats/filters.test.ts`: 22 pass;
  `src/frontend/alpine/chat-filters-server.test.ts`: 12 pass
  (`bun test`, 2026-11-09).

**Resolved:** 2026-11-09 registry-driven close: git issue f69c9c8 (registry tip: 8a3a81fb0 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-SERVER-SIDE-ROOM-FILTER-ENF)
