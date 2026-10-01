<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: DB: add updated_at to moderation and content tables

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-schema.md
**Tags:** db, schema, audit-columns

## Summary

**Summary:**
Add `updated_at` to moderation/content tables whose workflow state mutates with no update stamp. Exact gaps:

- `content_flags` → missing `updated_at` (status, resolution, resolved_by, resolved_at mutate)
- `moderation_actions` → missing `updated_at` (superseded_by, deleted_at, deleted_by mutate; already has `metadata`)
- `blog_comments` → missing `updated_at` (status, parent_comment_id mutate)
- `synthetic_data` → missing `updated_at` (status, validated_at, validated_by mutate; already has `metadata`)

**Context:**
Convention audit: `001_init.ts` defines `created_at text not null default (datetime('now'))`. These tables all have `created_at` and mutably transition through workflow states (flag → resolved; action → superseded/deleted; comment → approved/removed; synthetic case → validated), but none carry a generic update stamp. `moderation_appeals` and `nsfw_user_preferences` in the same subsystem already have `updated_at` — this ticket closes the gap for their siblings. No metadata proposed: the two tables that plausibly need it (`moderation_actions`, `synthetic_data`) already have it, and the others hold structured workflow columns.

**Column definitions:**
- `updated_at text` — nullable on add (SQLite forbids non-constant DEFAULT in ADD COLUMN); maintained by writers on every UPDATE. NO SQLite trigger: 001_init triggers are integrity-only (locations path), no timestamp-maintenance trigger precedent exists.

**Migration policy:**
- Append-only: new migration `018_*` (latest is `017_asset_links_archived_at.ts`). Never edit 001–017.
- Backfill in `up()`: `UPDATE <t> SET updated_at = COALESCE(resolved_at, created_at)` (content_flags), `= COALESCE(deleted_at, created_at)` (moderation_actions), `= created_at` (blog_comments, synthetic_data).
- Regenerate generated artifacts: `bun run db:sync-types && bun run db:sync-manifest`; `bun run schemas:check` green.

**Acceptance Criteria:**
- One `018_*` migration adds exactly the columns listed above to exactly the tables listed above; no other schema changes.
- Backfill UPDATEs present in `up()` as specified.
- Writers of affected tables set `updated_at` on every workflow transition.
- `bun run db:sync-types && bun run db:sync-manifest` run; `schemas:check` green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
