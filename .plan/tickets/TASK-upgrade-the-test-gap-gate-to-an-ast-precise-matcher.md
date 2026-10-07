<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Upgrade the test-gap gate to an AST-precise matcher

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-api-library-distribution.md

**Summary:**

scripts/check/test-gaps.mjs decides an export is covered when some test file imports that name. It cannot distinguish "this name is imported" from "this specific binding was exercised", so aliased imports, re-export chains and same-named symbols in different modules are all counted as coverage.

The cheap text scan was a deliberate choice and the reasoning is recorded in docs/meta/auto-test-generation.md: the gate ratchets over a set of gap keys, not a proof of coverage, and a ts-morph AST walk costs a dependency plus a full tree parse on every gate run.

Revisit that tradeoff if this epic needs the gate to answer a question other than "did the set grow?". For src/ as a programmatic API the case is stronger than it was at the time of that decision: an external consumer cares whether a module's exports are reachable and exercised, and an import-edge heuristic cannot tell them apart. A ts-morph walk resolves the binding to its declaration, so a name imported from the wrong module no longer counts.

Keep the ratchet regardless — the baseline is what makes the signal stable across runs. This changes the matcher's precision, not the gate's shape.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
