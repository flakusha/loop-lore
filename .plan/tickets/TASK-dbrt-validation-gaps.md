<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: DB Roundtrip Tests — Validate Inserted Values

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-testing

## Summary

DB-touching tests in `src/` insert rows then select but skip validation of inserted field values. Gaps found in `tree/api-version-placeholders/`:

1. **Timestamps never validated** — `created_at`/`updated_at`/`age_gate_accepted_at` rely on SQLite `datetime('now')` default (emits `"YYYY-MM-DD HH:MM:SS"`, space separator, no TZ) while app code writes `new Date().toISOString()` (full ISO-8601). No test asserts format of either. One row can hold both formats with zero test coverage.

2. **`src/db/database.test.ts` value-blind inserts** — users, actors, chats, chat_participants, messages, characters all inserted with fields never read back: role, status, settings, import_spec, data_source_format, data_raw, content_type, content_format, content_encoding, hidden_by, hidden_reason.

3. **`src/admin/config.test.ts` seedDefaults value-blind** — keys asserted to exist; seeded values never checked. Wrong config→key mapping passes all tests.

4. **Mock DB echo tests** (`music-links.test.ts`, `age-gate/controller.test.ts`) — assert what code passed to mock, never what the DB stored.

## Scope

### Must fix

- `src/age-gate/service.test.ts` — `age_gate_accepted_at` (:145) assertion upgraded from `toBeTruthy()` to full ISO-8601 format regex + `Date.parse` validity + Z-suffix check.
- `src/age-gate/service.test.ts` — `createTestDatabase` helper (:204) and production migrations (`src/db/migrations/parts/001_core.ts`) `datetime('now')` defaults: add a test that reads `created_at` after a real insert and asserts `"YYYY-MM-DD"` prefix (SQLite format) OR migrate defaults to `strftime('%Y-%m-%dT%H:%M:%fZ','now')` for ISO-8601. Pick one canonical; document in test.
- `src/db/database.test.ts` — add field assertions for every INSERT: users (role, status, settings), actors (settings, import_spec, data_source_format, data_raw), chats (name, type, mode, created_by), messages (content_type, content_format, content_encoding, status, hidden_by, hidden_reason), characters (name, description, avatar_url).
- `src/admin/config.test.ts` — `seedDefaults` tests (:180-207) add value assertions for each seeded key.

### Nice-to-have (mock DB upgrade to real DB)

- `src/chat/music-links.test.ts` — replace in-memory mock with real in-memory SQLite roundtrip.
- `src/age-gate/controller.test.ts` — replace mock insertInto with real DB roundtrip.

## Files to Touch

- `src/age-gate/service.test.ts`
- `src/db/database.test.ts`
- `src/admin/config.test.ts`
- `src/chat/music-links.test.ts` (if upgrading)
- `src/age-gate/controller.test.ts` (if upgrading)

## Verification

```bash
# Before: all pass, gaps invisible
bun test src/age-gate/service.test.ts src/db/database.test.ts src/admin/config.test.ts

# After: same tests + format assertions prevent silent timestamp regressions
# New assertions fail if:
#   - app code switches to Date.now() string or epoch ms
#   - migration defaults change to date('now') or strftime('%s','now')
#   - config seed values are wrong
#   - message hidden_by/hidden_reason columns are dropped
```
