<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: GM shadow-note revealed_to reveal is a read-modify-write without serialization: concurrent reveals lose an append

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-gm-shadow-notes

**Summary:**

Location: src/routes/gm-notes/shadow.ts reveal handler - :160-165 (select revealed_to), :177-180 (JS-side Set merge), :191-200 (full-array UPDATE).

Evidence: the handler reads revealed_to, merges new Set([...existing, ...incoming]) in JS, then writes back the whole array - two concurrent reveals for the same note interleave read-read and one append is lost. The status flip is a single column write; only the array is lost. No transaction or SQL-side append anywhere in the handler.

Verification: CODE-READ - trace shadow.ts:160-165 -> :177-180 -> :191-200, all re-read this session; the concurrency interleaving needs a live server + DB, infeasible read-only.

Impact: an audience member can silently stay unrevealed after two admins reveal concurrently. Low frequency, no corruption beyond the lost append.

Fix: SQL-side append semantics (revealed_to = revealed_to || new-id style json append) or a small transaction around read-modify-write.

Related: TASK-gm-shadow-note-trigger-condition-and-revealed-to-columns (6e48de1) is the feature ticket for the columns; this is the concurrency defect in the reveal handler that uses them.

Source: .tmp/glm-review/deep-landing-1015.md F-1 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 2b495f0 (registry tip: 4c1d6ea88 Konstantin Fedotov stale-resolved verified 2026-10-25: revealed_to merge runs inside datab)
