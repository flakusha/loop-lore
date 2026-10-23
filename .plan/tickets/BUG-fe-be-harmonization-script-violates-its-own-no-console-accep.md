<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: FE-BE harmonization script violates its own no-console acceptance criterion

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-fe-be-harmonization

**Summary:**

Reconciliation of `.plan/epics/epic-fe-be-harmonization.md` found AC5 unmet: the script is required to emit output only for findings.

`scripts/check-fe-be-harmonization.ts:86-99` emits `console.*` for banners and summaries that are not findings:

- L86 header banner `=== FE-BE harmonization ===`
- L87 summary counts
- L91-93 truncated-advisory banner
- L96 fail banner
- L99 OK banner

L88/L89 (blocking and advisory findings) are the only permitted uses. Route the banners through the project logger, or fold them into a single summary line adjacent to the findings they describe, per AC5.

Note: `console.*` is an enforced anti-pattern in `.agents/references/banned-patterns.md`, so this is a policy violation as well as an epic-AC violation.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-23 registry-driven close: git issue a5f1d91 (registry tip: 6ebb0e90f Konstantin Fedotov Close issue)
