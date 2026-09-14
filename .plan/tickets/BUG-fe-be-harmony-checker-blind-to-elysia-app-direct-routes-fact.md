<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: FE-BE: harmony checker blind to elysia-app direct routes, factory routes, sibling-schema consts

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Script scripts/check-fe-be-harmonization.ts misses: (1) routes mounted directly on parent app via (app as any).use/app.post in src/elysia-app.ts — POST /api/assets upload flagged FE-no-BE while code says 'registered directly in elysia-app.ts'; (2) createEntityRoutes factory in src/routes/entity-routes/{index,create,get,list,update,remove}.ts — /api/actors/:actorId/memories flagged FE-no-BE though actorMemoriesRoutes is mounted; (3) R constants imported from sibling schemas.ts (proactive-messaging) — resolved this round via const-map. Fix: teach scanBe elysia-app direct registrations + factory entityPaths expansion (parentPrefix/parentParam/entityPath from call sites), then promote gate to blocking. Verify: POST /api/assets + memories findings clear; dprint/tsc clean.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
