<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Effect v4 DI wiring spike versus the handleOpts bag

**Summary:** Test `Context.Service` + `Layer` against the 3-field `RegisterPluginsOpts` bag threaded into ~100 route factories and registered onto `Elysia<any>`.
**Context:** Epic epic-effect-v4-adoption-evaluation. Elysia is already a DI container, so a `go` requires all three: the `any` escape actually removed, TS2589 fixed structurally, and no rewrite of ~100 factories.
**Acceptance Criteria:** See ## Acceptance Criteria below — a 5–10 factory group wired both ways and measured, explicit answers on the `any` escape and the TS2589 class, LOC measured, one of ADOPT/ADOPT-SUBSET/REJECT written, no `src/` change.


**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-effect-v4-adoption-evaluation
**Tags:** effect, evaluation, spike, dependency-injection, wiring

## Summary

Spike S4. loop-lore wires services by threading a 3-field options bag into every
route factory. Effect offers `Context.Service` + `Layer` for type-checked service
resolution. Test whether that is a real improvement here — or whether it merely
fights Elysia's own plugin model, which already does the same job.

## The wiring under test

- `src/app/register-plugins.ts:110-115` — `RegisterPluginsOpts` = `{ database, config, asyncStore }`
- `src/app/register-plugins.ts:124` — `registerPlugins(app: Elysia<any>, opts)`; the `any` erases the app type
- ~100 `app.use(someRoutes(handleOpts))` calls in the same file
- `BUG-v1-route-chain-exceeds-ts-instantiation-depth.md` — the `.use()` chain blew
  TypeScript's instantiation depth (TS2589); closed by *splitting the chain*, a
  workaround, not a fix. The structural cause is untouched.

## Why this is not a duplicate container

An earlier draft of this ticket claimed "Elysia is already a DI container via
`.decorate()`" and treated Effect `Layer` as redundant. **That was wrong for
this repo.** `src/elysia-app.ts:14-15` says verbatim:

> Uses closure injection (not .state()/.decorate()) to avoid Elysia's complex
> type inference issues when merging plugins.

The closure-injection bag is not a stylistic choice — it is the documented
workaround for Elysia's own type-inference pain, and that same pain is what
produced the TS2589 route-chain failure later. A type-checked service layer is
therefore a genuine alternative candidate, not a second container stacked on
the first.

That does not make it a free win. The bar for a `go` stays high:

- the `Elysia<any>` escape hatch is actually removed (not moved), **and**
- the TS2589 class of failure goes away structurally, **and**
- the change does not require rewriting ~100 route factories.

If the spike cannot clear all three, the verdict is `REJECT` and the cheaper fix
— typing the app properly and dropping the `any` — is what ships.

## Method

1. Take one route group (5–10 factories), not the whole surface.
2. Build the `Context.Service` + `Layer` version beside it in `.tmp/`.
3. Measure: LOC delta; number of `any` escapes removed; whether the resulting
   type instantiation depth is structurally bounded.
4. Record the numbers in the epic's *Spike Results* table.

## Acceptance Criteria

- [ ] A 5–10 factory route group is wired both ways and the comparison is measured, not asserted
- [ ] The spike states explicitly whether the `Elysia<any>` escape at `register-plugins.ts:124` is removed or merely relocated
- [ ] The spike states explicitly whether the TS2589 failure class is fixed structurally or only deferred
- [ ] Net LOC delta recorded in the epic's *Spike Results* row S4
- [ ] A written verdict of `ADOPT` / `ADOPT-SUBSET` / `REJECT` is recorded; a `REJECT` must name the cheaper alternative (typing the app without `any`)
- [ ] No `src/` file is modified — this is a measurement ticket

## Files

- `.tmp/effect-di-spike/` — scratch harness (git-ignored, delete before merge)
- `.plan/epics/epic-effect-v4-adoption-evaluation.md` — *Spike Results* row S4

## Dependencies

- Blocked by: `TASK-effect-v4-bun-esm-typecheck-compatibility-spike` (hard gate)
- Reads: `src/app/register-plugins.ts`, `.plan/tickets/BUG-v1-route-chain-exceeds-ts-instantiation-depth.md`
