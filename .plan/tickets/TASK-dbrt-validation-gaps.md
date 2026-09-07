<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: DB Roundtrip Tests — Validate Inserted Values

**Status:** 🔄 In Progress
**Priority:** High
**Effort:** Medium
**Epic:** epic-testing

## Summary

Implemented (dev `53f89d85`):

- **`src/age-gate/service.test.ts`** — `age_gate_accepted_at` now asserts ISO-8601 regex `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` + `Date.parse` validity. New test pins `created_at` default as `"YYYY-MM-DD HH:MM:SS"` (SQLite `datetime('now')` format). `createTestDatabase` helper rewritten to use raw SQLite DDL (bypasses Kysely type issue that stored literal `"datetime('now')"` string instead of evaluating the expression).

- **`src/db/database.test.ts`** — `insert user as actor` now validates users.role/status/settings and actor.settings/import_spec/data_source_format/data_raw. `message defaults to visible` now validates content_type/content_format/content_encoding/status. New test `chat fields are persisted correctly` validates chats.name/type/mode/created_by.

- **`src/admin/config.test.ts`** — new test `seeded values match the config` validates every seeded key's value (registration_open, session_timeout_hours, max_sessions_per_user, max_upload_size_bytes, log_retention_days, default_provider, default_model, auto_moderation, profanity_filter, spam_detection, max_flags_before_hide).

Deferred to follow-up:
- Mock DB upgrades (`music-links.test.ts`, `age-gate/controller.test.ts`) — require more substantial refactoring to replace the in-memory mock chains with real DB roundtrips.

## Scope

### Must fix

- `src/age-gate/service.test.ts` — `age_gate_accepted_at` (:145) assertion upgraded from `toBeTruthy()` to full ISO-8601 format regex + `Date.parse` validity + Z-suffix check. ✅ Done dev `53f89d85`.
- `src/age-gate/service.test.ts` — `created_at` format test added. ✅ Done dev `53f89d85`.
- `src/db/database.test.ts` — field assertions for users, actors, messages, chats. ✅ Done dev `53f89d85`.
- `src/admin/config.test.ts` — `seedDefaults` value assertions. ✅ Done dev `53f89d85`.

### Nice-to-have (mock DB upgrade to real DB) — DEFERRED

- `src/chat/music-links.test.ts` — replace in-memory mock with real in-memory SQLite roundtrip.
- `src/age-gate/controller.test.ts` — replace mock insertInto with real DB roundtrip.

## Files Touched

- `src/age-gate/service.test.ts` ✅
- `src/db/database.test.ts` ✅
- `src/admin/config.test.ts` ✅

## Verification

```bash
bun test src/age-gate/service.test.ts src/db/database.test.ts src/admin/config.test.ts
# 52 pass, 0 fail, 172 expect() calls
```
