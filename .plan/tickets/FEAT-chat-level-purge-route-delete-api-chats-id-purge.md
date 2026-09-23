<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Chat-level purge route — DELETE /api/chats/:id/purge

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-archival-workflow
**Summary:** Add `DELETE /api/chats/:id/purge` route that invokes `hardDeleteChat` with the existing admin/ownership gate.
**Context:** gap-audit 2026-09-23 of `epic-archival-workflow` found `hardDeleteChat` exists at `src/chat/service/visibility.ts:64-74` but has no HTTP route; `archiveRoutes` only exposes `/archive` and `/unarchive` so admins cannot trigger a hard purge.
**Acceptance Criteria:** `DELETE /api/chats/:id/purge` returns 204 on success; cascades `asset_links` via existing `hardDeleteChat` semantics; auth gate matches archive/unarchive precedent; no regression to existing archive/unarchive happy-path tests.

## Summary

## What

Chat-level purge route is missing. Spec calls for DELETE /api/chats/:id/purge.

## Why

hardDeleteChat exists at src/chat/service/visibility.ts:64-74 but has no HTTP route. archiveRoutes at src/routes/chats/archive-routes.ts:23-65 only exposes /archive and /unarchive — there is no DELETE handler that calls hardDeleteChat, so admins cannot trigger a hard purge via the HTTP API.

## Scope

Extend archiveRoutes in src/routes/chats/archive-routes.ts with a DELETE handler that calls hardDeleteChat for the given chat id. Reuse existing auth/ownership gates (admin-only or settings-access per archive/unarchive precedent).

## Acceptance Criteria

- DELETE /api/chats/:id/purge returns 204 on success.
- Cascades asset_links (existing hardDeleteChat semantics).
- Admin-only or settings-access authorization (consistent with archive/unarchive).
- No regression to existing archive/unarchive happy path tests.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
