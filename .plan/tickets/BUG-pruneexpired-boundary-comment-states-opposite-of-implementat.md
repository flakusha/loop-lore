<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: pruneExpired boundary comment states opposite of implementation

**Status:** Done
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


## Verification Notes (2026-10-01)

Re-verified against current `dev`; the defect described in this ticket is
already fixed. The ticket was left open past the fix.

Evidence: `src/middleware/rate-limit.ts:77-80`

- The boundary comment now states the rule correctly: a timestamp exactly at the cutoff is still in-window and kept; only strictly older ones are dropped. The implementation (`queue[0]! < cutoff`) agrees with the comment.
