<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: plan ticket Status parses inside fenced code blocks

**Status:** Done
**Priority:** high
**Effort:** Small
**Epic:** epic-unified-spec-framework
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The ticket-markdown parser is fence-blind: it line-scans the 30-line header window for a Status marker, so a Status-looking line inside a fenced code block can win first-match and set the wrong status, while the format gate scans the whole file. Parser and gate can disagree on the same file. Research: .tmp/research/giwt-md-json-parsing-2026-11-26.md and .tmp/research/giwt-md-json-roundtrip-gaps-2026-11-26.md. Fix site is the giwt package parser (node_modules/giwt) or a loop-lore-side guard. Acceptance: a fenced Status-looking line never determines ticket status; parser and gate agree on the measured corpus.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-26 registry-driven close: git issue b45712e (registry tip: cec9032ad Konstantin Fedotov Verified fixed in installed giwt: fence-aware status scan (linesOutside)
