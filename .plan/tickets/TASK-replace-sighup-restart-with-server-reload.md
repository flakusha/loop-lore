<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Replace sighup restart with server reload

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-http-protocol-features.md

## Summary

Use `server.reload()` for cert/key rotation without dropped sockets, replacing SIGHUP full restart.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
