<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: pruneExpired boundary comment states opposite of implementation

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:** pruneexpired boundary comment states opposite of implementat
**Context:** Context: fba9dbcd8/3f6329b02.
**Acceptance Criteria:** correct the comment to 'a timestamp at cutoff is still in-window'.

## Summary

Context: fba9dbcd8/3f6329b02. Severity: nit. rate-limit.ts:78-82 comment says a timestamp at exactly cutoff 'has aged out' but the code keeps ts == cutoff (queue[0]! < cutoff). Behavior matches api-governance store.ts (t > cutoff) — only the doc is wrong, on the exact edge BUG-rate-limit-off-by-one names. Fix: correct the comment to 'a timestamp at cutoff is still in-window'.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
