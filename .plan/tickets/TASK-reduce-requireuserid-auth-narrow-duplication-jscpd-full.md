<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Reduce requireUserId auth-narrow duplication (jscpd:full)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Foundational refactor: extract the 3-line auth-narrow triple (requireUserId + typeof narrow [+ optional resolve*Owner + denied check]) into withUserAuth / withOwnerAuth helpers in routes/http-utils/responses.ts. Wire into high-leverage route files; further files can convert mechanically in follow-up PRs.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
