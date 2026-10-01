<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Story-points mutations double-swallow cache-refresh failures silently

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:** story points mutations double swallow cache refresh failures
**Context:** Context: 681e6605e.
**Acceptance Criteria:** drop the outer .catch or log at debug.

## Summary

Context: 681e6605e. Severity: nit. mutations.ts:72,140 add void refreshActorStoryPointsCache(...).catch(() => {}) — the helper already swallows internally (double swallow, zero log). Fix: drop the outer .catch or log at debug.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
