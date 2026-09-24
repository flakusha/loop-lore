<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Waiver: coverage floor below 80 for plugins/frontend/native in coverage-batch-2 scope

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-testing-qa

## Summary

Scoped gate (bun test --isolate --coverage + coverage.mjs --floor=80 --only=...) reports plugins 52.3% (147/281), frontend 63.6% (6106/9597), native 76.4% (120/157). Raising these needs plugin-loader end-to-end tests (+78 lines, FEAT-048..051 workstream) and broad frontend suites (+1600 lines) — out of scope for the mock-leak fix. Native (+6) fits a follow-up gap test. Waiving floor for these three modules for the coverage-batch-2 merge; track real tests in plugin/frontend workstreams.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
