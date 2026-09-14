<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: FE-BE: character-growth arc/confirm/reject declare unsatisfiable actorId param, Elysia 422s every call

**Status:** ✅ Resolved (already on dev, 2026-09-14)
**Priority:** high
**Effort:** Medium

## Summary

BE src/routes/character-growth/index.ts PATCH ${R}/arc + POST growth-log/:entryId/confirm + POST growth-log/:entryId/reject declare params actorId that no route path carries (actorId arrives via ?query). Elysia validates params first and 422s before the handler, so FE src/frontend/character-growth-editor.ts saveArc/confirmEntry/rejectEntry can never succeed. Coverage test routes.coverage.test.ts:191 asserts the 422s (documents the bug, not the contract). Fix: params schema { entryId } only, read actorId from query via getString como listGrowthLog does. Verify: harmony diff loses 3 findings; coverage test expects 200-path behavior.

## Resolution

Already fixed in dev by `00d2c1201` (fix(growth): actorId via query; checker const-R + extents) and `70e9cb6eb` (test(fe-be): pin character-growth editor query-actorId URL shapes). Verified 2026-09-14 against `dev` HEAD `e90418082`:

- `src/routes/character-growth/index.ts:70-94,138-194` — `params: t.Object({ actorId, entryId })` → `params: t.Object({ entryId })` + `query: t.Object({ actorId })`; matches the `listGrowthLog` GET pattern at lines 103-129.
- `src/frontend/character-growth-editor.ts:91-95` — `saveArc` URL switched from `/api/character-growth/arc/${encodeURIComponent(this.actorId)}` to `/api/character-growth/arc?actorId=${encodeURIComponent(this.actorId)}`.
- `src/routes/character-growth/routes.coverage.test.ts:190-217` — test renamed "rejected by param validation" → "require actorId via query"; added happy-path probe asserting 200/404/409.
- `src/frontend/character-growth-editor.test.ts:43,52,55` — URLs pinned to `?actorId=…` shape.
- Live reproduction probe (localhost origin, real Elysia app): PATCH arc / POST confirm / POST reject without actorId → 422; with actorId → 500 (validation passes; empty DB stub fails downstream at auth/service — proves handler reached).
- Test verdict: `bun test src/routes/character-growth/routes.coverage.test.ts src/frontend/character-growth-editor.test.ts` → 13 pass, 0 fail, 153ms.
- Cross-references: sibling `BUG-fe-be-harmony-checker-blind-to-elysia-app-direct-routes-fact.md` is also ✅ Resolved by the same bookkeeping bucket.

No code change required.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated