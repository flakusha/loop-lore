<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: extractJsonObject slices an unbounded LLM response before JSON.parse

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-provider-plugin-ecosystem

**Summary:**

extractJsonObject takes indexOf('{') to lastIndexOf('}'), which on a malformed or adversarial classifier response allocates and then parses a megabyte-scale substring. It is not ReDoS, and it is already exception-safe downstream, but the slice itself is unbounded.

Evidence read on dev:

- src/turning/classifier-selection.ts:70-75 — const start = content.indexOf('{'); const end = content.lastIndexOf('}'); return content.slice(start, end + 1);

Acceptance: cap the search window (e.g. 64 KiB) before slicing, and keep the existing fail-open null return for out-of-window responses.

Source: .tmp/longcat/review-consolidated.md nit 22; .tmp/cat-jam/review-generation-rpg-db.md P2-4.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue cb56562 (registry tip: 5303cbfc8 Konstantin Fedotov Close issue)
