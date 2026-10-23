<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: perf(server): no-cache HTML entry points; stream static files with Range support

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-server-lifecycle-hardening

**Summary:**

Sources: stream-a #11. Where: src/server/static-files.ts:51-66 (max-age=60 incl. entry points), :111 (readFileSync per request), :175-206 (no Range/partial-content). Gap: non-hashed files including index.html/views entry points get public, max-age=60, so deploys serve stale HTML for a minute; respondWithFile blocks the loop with readFileSync and offers no Range support, so large media cannot seek. Acceptance: split cache policy: immutable for hashed assets, no-cache for .html entry points (observable response headers differ). Static serving supports Range/206 and no longer blocks per request (follow-up: async/streaming reads). Priority: low - staleness window is 60s; media seeking is a functionality gap, not correctness.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
