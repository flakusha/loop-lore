<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Replace knip global types exclusion with per-symbol knipignore tags

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Approved 2026-09-03 (knip triage item). knip.json currently sets exclude:[types], gagging ALL type-export dead-code analysis. Replace with per-symbol @knipignore tags on intentionally-public type re-exports (test-helper barrels, plugins/**/types.ts scaffolding, dice-roller/routes.ts etc.), restoring type signal. Gate: bun run dead:code and dead:code:ci stay green. Implementation started this session (worktree knip-types-signal).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
