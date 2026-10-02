<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Persona lifecycle contract (setDefault + invalid-id + tuning fields)

**Status:** Done
**Status Note:** Done-with-evidence — the contract described below already holds in code; no open work. Filed to close the impersonation-epic wiring question, not to authorize new code.
**Priority:** Medium
**Effort:** Small
**Type:** Feature Ticket
**Tags:** persona, impersonation, lifecycle, contract
**Epic:** epic-impersonation

## Summary

Pin the persona lifecycle contract that `epic-impersonation.md` (persona-per-chat selection feeding `<user_persona>`) depends on: `setDefault` ownership/invalid-id behavior, the HTTP path that reaches it, and the tuning-fields (`title`/`temperature`/`max_tokens`/`model`) lifecycle across create/update/convert-to-character. All verified present — see Evidence.

## Context

- Prior tickets `BUG-personas-setdefault-silently-succeeds-for-invalid-personaid-` and `TASK-persona-setdefault-getdefault-unwired-delete-or-wire` (both Done) reported `setDefault` as unchecked and unwired. Both premises are now stale: `applyDefault` enforces existence/ownership and `update(isDefault:true)` delegates to it.
- There is no dedicated `POST /api/personas/:id/set-default` route and none is needed: `PATCH /api/personas/:id` with `{ isDefault: true }` is the single HTTP path, and it maps invalid ids to 404.
- Precedent `249b379c1` (`fix(personas): carry persona tuning into converted actor`, 2026-09-18) landed the `title`/`temperature`/`max_tokens`/`model` carry in `src/personas/convert.ts` with regression tests in `handlers.test.ts` + `service.missing.test.ts`.

## Evidence (grep-verified)

- `src/personas/service.ts:132-136` — `setDefault` runs in a transaction via `applyDefault`.
- `src/personas/service.ts:169-180` — existence + ownership check throws `Error("Persona not found")` on invalid/foreign id.
- `src/personas/service.ts:101-105` — `update(isDefault:true)` delegates to `applyDefault` (single owner of the one-default-per-user invariant).
- `src/personas/handlers.ts:154-169` — `handleUpdatePersona` maps `"Persona not found"` to 404; tuning fields pass through at `handlers.ts:150-152`.
- `src/personas/controller.ts:56` — `PATCH /api/personas/:id` route exists; no `handleSetDefault` exists by design (single PATCH path).
- `src/personas/service.test.ts:131-134` — `setDefault` throws for missing/foreign persona; `service.test.ts:110-129` — PATCH-path flip unsets the previous default.
- `src/personas/convert.ts:72-75` + `src/personas/handlers.test.ts:427` — `title`/`temperature`/`max_tokens`/`model` carried into actor settings on convert-to-character.

## Acceptance Criteria

- [x] `setDefault` throws `Persona not found` for invalid or foreign persona ids (service.ts:169-180, test service.test.ts:131-134).
- [x] Invalid-id error surfaces as HTTP 404 on the reachable path (`PATCH /api/personas/:id` + `isDefault:true`, handlers.ts:154-169).
- [x] Tuning-fields lifecycle (`title`/`temperature`/`max_tokens`/`model`) verified on create, update, and convert-to-character (handlers.test.ts:173-187, 265-273; convert.ts:72-75).
- [x] No dedicated set-default HTTP handler required — single PATCH path documented as the contract; no new route to build.
