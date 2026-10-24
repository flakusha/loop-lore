<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: egui sent-message echo empty

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-experimental-egui-frontend

**Resolution:** `native/loop-lore-egui/src/api.rs` — `parse_sent_message` drops content-less rows (`.filter(|m| !m.content.is_empty())`); fixture `no_reply` now expects `message: null`. 23 api tests pass.
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

parse_sent_message (native/loop-lore-egui/src/api.rs:264) expects a data envelope the server never emits — responses.ts:93-108 flattens to {id,context,meta}. Echoed user row renders empty (api.rs:295). Evidence: .tmp/interaction-cycles.md ## Chat turn. Epic: epic-interaction-surfaces-audit.

**Context:**
Envelope mismatch between egui client parser and server chat-reply response shape.

**Acceptance Criteria:**
- [ ] Fix, or explicitly wontfix with reason

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-24 registry-driven close: git issue b5b3751 (registry tip: d4bb424a5 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-EGUI-SENT-MESSAGE-ECHO-EMPTY)
