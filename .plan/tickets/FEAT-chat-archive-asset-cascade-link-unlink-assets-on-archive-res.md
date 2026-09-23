<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Chat archive asset cascade — link/unlink assets on archive/restore

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-archival-workflow
**Summary:** Extend chat archive/restore to soft-isolate `asset_links` via an `archived_at` column on the join rows; hard purge path remains the hard-delete cascade.
**Context:** gap-audit 2026-09-23 of `epic-archival-workflow` found that `archiveChat`/`unarchiveChat` flip only the chat's `archived_at` and never touch `asset_links`, so assets remain exposed on archived chats even though the chat is logically retired.
**Acceptance Criteria:** Archiving sets `asset_links.archived_at = now()`; restoring clears it; hard purge continues to hard-delete the rows; migration adds the column + index with rollback; no regression on existing archive/unarchive happy-path tests.

## Summary

## What

Asset cascade is missing on the archive/restore path. The chat archive endpoints (POST /api/chats/:id/archive and POST /api/chats/:id/unarchive) do not touch the asset_links join rows, so archived chats continue to expose assets through the join table even though the chat is logically retired.

## Why

deleteChat at src/chat/service/crud/delete.ts:44-47 cascades asset_links when a chat is hard-deleted (it removes the asset_links rows pointing at that chat). The archive path in src/chat/service/visibility.ts (archiveChat/unarchiveChat, ~lines 64-74) flips only the chat's archived_at timestamp; it never touches asset_links. The spec for the archival workflow calls for soft-link/unlink behavior on archive/restore, distinct from the hard-delete cascade.

## Scope

Extend archiveChat/unarchiveChat in src/chat/service/visibility.ts to soft-link/unlink asset_links via an archived_at column on the join rows. New migration adds asset_links.archived_at nullable timestamp + index. archiveChat sets archived_at = now() for the chat's asset_links; unarchiveChat clears archived_at = null. Hard purge remains the hard-delete path that removes the rows outright. Touch archiveRoutes in src/routes/chats/archive-routes.ts only if the response shape changes; otherwise no controller edit.

## Acceptance Criteria

- Archiving a chat soft-isolates its assets: asset_links rows for that chat have archived_at set and are excluded from default asset listings.
- Restoring a chat re-links the assets: archived_at is cleared on the corresponding asset_links rows and assets reappear in default listings.
- Hard purge (existing hardDeleteChat path) hard-deletes the asset_links rows outright, regardless of archived_at.
- Migration adds archived_at + index; rollback drops them.
- No regression to existing archive/unarchive happy path tests.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
