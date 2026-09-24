<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: verifyJwt accepts malformed or claimless payload as valid

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** critical
**Effort:** Medium

## Summary

jsonParseOr returns empty object on parse failure; payload.exp < now becomes undefined < now = false, so a token with valid signature but missing exp/sub/sid/role is valid:true. Missing exp never expires. Fix: treat parse failure as invalid; assert required claims present and exp finite > now. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
