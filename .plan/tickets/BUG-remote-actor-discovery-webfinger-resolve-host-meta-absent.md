<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Remote actor discovery (WebFinger resolve, host-meta) absent

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-federation-swarm-sync

## Summary

FEAT-activitypub-federation AC covers only local WebFinger resolvable actors (@world@host); it does not specify resolving remote actors (@remote@host), host-meta, or actor fetch needed for inbound follows. Gap. Fix: add remote-discovery AC using WebFinger and actor document fetch.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 550802a (registry tip: 81ef919d9 Konstantin Fedotov Close issue)
