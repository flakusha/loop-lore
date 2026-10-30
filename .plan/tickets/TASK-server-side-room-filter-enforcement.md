<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: server-side room-filter enforcement

**Status:** Not Started
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

- [ ] Per-user room-filter rows persisted server-side (schema/migration + persistence surface)
- [ ] List endpoint honors persisted rows when explicit params are absent; explicit params win when present
- [ ] Client keeps sending filters and remains authoritative for display-only filtering
- [ ] Tests covering persistence, precedence, and list-query application

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
