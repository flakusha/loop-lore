<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Transform tests idempotency precedence authz

**Summary:** (none captured)
**Context:** (none captured)
**Summary:** Test coverage for three transform invariants: upsert idempotency (same payload twice → one row), context-override precedence (user override > world override > auto-seed > default), foreign-asset authz denial (user A cannot mutate user B's asset transform). Part of `epic-asset-platform-capabilities.md` B1-B5.
**Context:** Today transform tests cover the happy path. The three invariants above are the production-risk surface: idempotency prevents duplicate rows under retry storms; precedence is the reason the derived-default path exists; authz is the security boundary. Test fixture: two users + two assets + one transform each; assert cross-user mutation returns 403.
**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-asset-transform-metadata

## Summary

Upsert idempotency, context-override precedence, foreign-asset authz denial. Part of epic Asset Transform Editing + Metadata.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
