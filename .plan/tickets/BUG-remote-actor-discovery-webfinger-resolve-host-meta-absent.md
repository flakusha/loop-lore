<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Remote actor discovery (WebFinger resolve, host-meta) absent

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** not-yet-implemented
**Priority:** medium
**Effort:** Medium

## Summary

FEAT-activitypub-federation AC covers only local WebFinger resolvable actors (@world@host); it does not specify resolving remote actors (@remote@host), host-meta, or actor fetch needed for inbound follows. Gap. Fix: add remote-discovery AC using WebFinger and actor document fetch.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
