<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: server.host config and HOST env override are dead - start.ts never passes hostname to Bun.serve

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ticket body)
**Acceptance Criteria:** (see ## Acceptance Criteria)

## Summary

src/server/start.ts:120 and :129 call serve({ port, fetch }) without host/hostname, so Bun.serve always binds 0.0.0.0. src/config/schema/sections/server.ts defaults server.host=localhost and src/config/schema-class/env-map.ts:98 maps HOST env to server.host, but neither has any effect. Anyone setting HOST=127.0.0.1 expecting loopback-only binding gets an all-interfaces bind. Fix: pass hostname: config.server.host in both serve() calls (and add a regression test asserting the bind host), or delete the config key and HOST mapping.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
