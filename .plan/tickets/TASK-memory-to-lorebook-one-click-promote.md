<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Memory to lorebook one-click promote

**Status:** Done
**Status Note:** 2026-11-09 landing (branch feat-memory-lore-promote, d89c1cdbb): the user-facing one-click promote UI slice now EXISTS — memory-panel character tab gains a per-memory Promote-to-lorebook action (memory-panel.html + memory-panel-core.ts loreEntryDraftFromMemory: name from first keyword else 48-char content prefix, keys from memory keywords capped at the route 5-key limit, explicit confirm() before insert, POST to existing POST /api/v1/actors/:actorId/lore-entries with server-side ownership enforcement; failures surface on panel error banner, memory kept). Prior reconcile note claiming the surface was NOT found is superseded. ~127 LOC excl. tests/locales; no migration, no new route. Tests: memory-panel.test.ts +8 blocks, actor-lore-entries.test.ts +1 keys-persistence pin.
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

ST memory-to-lore is manual everywhere (DeepWiki: vectors ext can include World Info, promotion is manual). Differentiator: one-click promote of a chat summary into a lorebook entry. Scope: assistant command or chat action taking a summary/message range, drafting entry (keys auto-suggested from content), user confirms before insert; reuse inclusion-group admission + activation scoring. Research: .tmp/research/metaapps-summary-2026-11-03.md gap 4, st-gap-validation-2026-11-03.md. Epic: epic-lorebook-inclusion-groups.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
