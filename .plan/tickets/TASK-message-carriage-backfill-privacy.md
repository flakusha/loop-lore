<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message carriage backfill + privacy

**Summary:** Plaintext-at-rest note, retention policy, backfill decision, and export exclusion for carriage rows.
**Context:** Carriage rows carry language signals and label JSON derived from user text — hidden from participants but still sensitive. `messages.metadata` is already excluded from shared export (export-shared exclusion); carriage rows get the same exclusion. Decide backfill (leave historical messages without rows vs one-shot detection pass) and retention (whether rows die with their message on delete). FTS must not index carriage content.
**Acceptance Criteria:**

- [ ] Export paths exclude carriage rows (mirror the export-shared exclusion of `metadata`)
- [ ] FTS does not index carriage columns
- [ ] Retention rule documented and implemented (rows deleted with their message, or explicit policy)
- [ ] Backfill decision recorded (no backfill vs one-shot pass) with rationale
- [ ] Plaintext-at-rest note: what is stored, why a hash/ref is preferred over a second full copy
- [ ] Tests passing; docs updated

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-multilingual-carriage

git issue: b37dfa1
