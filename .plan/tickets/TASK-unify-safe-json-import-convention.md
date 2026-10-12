<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Unify safe-json import convention

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Two import conventions for the safeJson helpers coexist: ~135 files import them via the src/utils.ts barrel while ~75 import utils/safe-json directly (counts approximate at filing time - recompute). Pick one convention (barrel-only or direct-only), enforce it with an eslint no-restricted-imports rule, and migrate the losing call sites. Matches the keep-vs-wire-vs-remove triage directive in docs/meta/code-practices-improvements/knip-jscpd-research-2026-09-03.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
