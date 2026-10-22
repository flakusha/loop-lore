<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Solo-user cold-start race caches phantom uid

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** `getOrCreateSoloUserForAuth` re-reads the winning row when its insert loses the username UNIQUE race and caches THAT id, instead of caching the id it never persisted. A concurrent cold start (two callers before the cache is set) now returns the same, persisted user id.
**Priority:** medium
**Effort:** Medium
**Caveats:** data races — the losing insert is detected by the username UNIQUE constraint and the winner's row is re-read by username, so the cached id is always the persisted one; TOCTOU — the re-read is a separate statement after the failed insert, so if the winning row is deleted in between the helper returns null and caches nothing rather than a phantom id; stale state — the solo id is cached per database instance, so a user row deleted after caching stays cached until resetSoloUserCache() is called

## Summary

src/middleware/auth/solo-user.ts:55-95 getOrCreateSoloUserForAuth: concurrent calls both miss cache, both try insert; loser insert fails unique constraint (caught) but soloId stays the phantom uid, then cache.set(id: phantom). All later solo auth uses non-existent user until resetSoloUserCache(). Fix: on insert failure re-SELECT real id before caching, or INSERT ON CONFLICT and re-read. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-22 registry-driven close: git issue bee01ca (registry tip: 38543459a Konstantin Fedotov Auto-closed: appended .md marker marks TASK-SOLO-USER-COLD-START-RACE-C)
