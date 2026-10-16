<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison set routes — CRUD, ownership, validation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-technical-comparison-charts`
**Related:** `TASK-comparison-set-variant-data-model.md`, `TASK-comparison-fan-out-engine.md`, `TASK-comparison-grid-frontend.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Elysia routes for comparison sets: create/read/update/delete, plus listing a user's sets and reading
one set with its variants. Every route is ownership-scoped and validates variant shape.

## Context

The route-module precedent is `src/routes/model-comparisons.ts` — `export function
modelComparisonsRoutes({ database }, prefix = "/api")` returning an Elysia instance, using
`requireUserId` / `jsonResponse` / `jsonError` from `src/routes/http-utils.ts`, the
`ErrorResponse` / `SuccessResponse` schemas from the `src/validation/schemas` barrel, and
`jsonParseOr` / `safeJsonStringify` from the `src/utils` barrel. It scopes by `user_id` on every
read. **It is LLM output rating, not images** — do not extend it; this ticket adds a sibling
module.

Ownership checks elsewhere use `checkChatAccess` from the `src/chat/service` barrel
(`src/generation/image-gen-route.ts:7`); comparison sets are user-scoped, so the `user_id` column
comparison is the access rule and a mismatch must 404, not 403 (do not leak existence).

Variant validation must reject, at the route boundary:

- `backend` outside the `apiFamily` values `generateImages` dispatches on — `openai|sdapi|sdcpp|comfyui`
  (`src/generation/image-engine/index.ts:36-60`);
- non-positive `steps`, `cfg` outside its provider range, non-positive `width`/`height`;
- a `reference_set` naming asset ids the caller does not own;
- an `edit_mask_asset_id` the caller does not own;
- a variant list longer than a hard cap (a comparison set is a comparison, not a batch job).

Depends on `TASK-comparison-set-variant-data-model.md` for the tables.

## Acceptance Criteria

- [ ] `src/routes/comparison-sets.ts` exports `comparisonSetsRoutes({ database }, prefix = "/api")` in the `src/routes/model-comparisons.ts` module shape
- [ ] `POST /api/comparison-sets`, `GET /api/comparison-sets`, `GET /api/comparison-sets/:id`, `PATCH /api/comparison-sets/:id`, `DELETE /api/comparison-sets/:id` all registered
- [ ] Reading, patching, or deleting another user's set returns 404 (existence not leaked)
- [ ] `POST` with `backend: "stable-diffusion-xl"`, `steps: 0`, `width: 0`, or a foreign `reference_set` asset id returns 400 with a field-level message
- [ ] Variant count over the cap returns 400
- [ ] `GET /api/comparison-sets/:id` returns the set plus its variants ordered by `position`
- [ ] `src/routes/comparison-sets.test.ts` covers the ownership 404, the four validation rejections, and the variant ordering
