<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Keynav handler isolation logs via console.error instead of logger

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:** keynav handler isolation logs via console error instead of l
**Context:** Context: 81bf29fc2.
**Acceptance Criteria:** route through getLogger().

## Summary

Context: 81bf29fc2. Severity: nit. src/frontend/alpine/shortcuts.ts:124 uses console.error (banned pattern, week-diff). The leaf-level rationale is weak: alpine/logger.ts has no cycle and sibling chat-panels.ts (same week) imports it. Fix: route through getLogger().

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
