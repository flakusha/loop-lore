<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: memory decay writes NaN strength

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

src/memory/purge.ts:55 const lastAccessed = mem.last_accessed_at ?? mem.id (uuid string) -> new Date(uuid)=Invalid -> decay NaN -> strength NaN on any memory with NULL last_accessed_at; breaks strength>0 filters/purge/injection order. purge.test.ts always sets last_accessed_at. Fix: null-coalesce to created_at or now; add test.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
