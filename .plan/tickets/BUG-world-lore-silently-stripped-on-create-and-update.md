<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: world lore silently stripped on create and update

**Status:** ✅ Resolved (fixed 2026-09-05)
**Priority:** medium
**Effort:** Small

## Summary

src/routes/worlds/worlds.ts:90,143 read body.lore but WorldCreateBody/WorldUpdateBody (src/validation/schemas/worlds.ts:13-26) declare no lore; Elysia strips unknown keys -> lore stored NULL both ways. Fix: add lore to both schemas; test create+update round-trip.

## Resolution

Fixed 2026-09-05. Verified `bun test src/routes/worlds/worlds-routes.test.ts` (2 pass — create-with-lore round-trip + NULL default; `bun run typecheck` `EXIT=0`):

- `src/validation/schemas/worlds.ts:16,25` — `lore: t.Optional(t.String(),)` added to `WorldCreateBody` and `WorldUpdateBody`.
- Handlers unchanged (`worlds.ts:90,143` already wrote `body.lore` once the schema stopped stripping it).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
