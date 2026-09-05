<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: world lore silently stripped on create and update

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

src/routes/worlds/worlds.ts:90,143 read body.lore but WorldCreateBody/WorldUpdateBody (src/validation/schemas/worlds.ts:13-26) declare no lore; Elysia strips unknown keys -> lore stored NULL both ways. Fix: add lore to both schemas; test create+update round-trip.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
