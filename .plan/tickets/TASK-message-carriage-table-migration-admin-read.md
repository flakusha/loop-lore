<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message carriage table migration + admin read path

**Summary:** New `message_language_carriage` table mirroring the 028 `carriage_records` pattern, with an admin-gated read path and key-scoped fail-closed readers.
**Context:** Hidden per-message language/context carriage needs a dedicated table — `messages.metadata` is participant-visible via the `selectAll` + spread path (`src/chat/service/read.ts:29-33,79-93`, `src/routes/messages/read.ts:137-144`) and `message_translations` (`src/db/schema-core.ts:761-770`) has no writer or reader. The precedent is `028_carriage_records.ts:7-39` (table) + `src/routes/admin/carriage.ts:8-36` (admin gate) + `src/routes/messages/helpers.ts:157-169` (key-scoped fail-closed readers).
**Acceptance Criteria:**

- [ ] Migration creates `message_language_carriage` (`message_id` FK, `detected_locale`, `source_text_ref` or content hash, `classification_labels` JSON, `producer_version`), numbered after the latest migration
- [ ] Admin-gated read route mirrors `src/routes/admin/carriage.ts:8-36`; non-admin reads fail closed
- [ ] Key-scoped readers mirror `src/routes/messages/helpers.ts:157-169` (fail closed on unknown key)
- [ ] No participant-visible route, spread, or selectAll exposes the new rows
- [ ] Tests passing; docs updated

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-multilingual-carriage

git issue: 26493aa
