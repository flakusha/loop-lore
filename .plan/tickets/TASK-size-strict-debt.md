# TASK-size-strict-debt: Close size-strict debt and promote size guard to CI gate

**Status**: ✅ split complete — 0 offenders; promotion-to-CI pending
**Priority**: medium
**Labels**: tooling, size-check, ci, refactor
**Assignee**:
**Epic**: epic-file-splitting
**Related**: TASK-PLAN-SIZE-STRICT-DEBT, TASK-promote-size-check-to-ci

## Description

`scripts/check-file-size.ts` already excludes `.test.` files, `/migrations/`, and
`DO NOT EDIT MANUALLY` generated files. Today `bun run check`'s `size:strict` reports ~138 files
over 250L as a non-blocking report. Once the split tasks under this epic reduce offenders to 0,
promote `size:strict` to a **blocking** gate.

## Progress

- 137 → 125 offenders (13 splits closed via `file-split-routes` → dev `eb3ed64f` and
  `file-split-round3` → dev `5a4f0b2a`):
  - Round 2: routes/views, routes/admin, routes/chats, routes/worlds, routes/battle,
    routes/characters, assets/service, validation/schemas, elysia-app. `src/server.ts`
    split into `server/` barrel.
  - Round 3: auto-gen/auto-generation.ts (588→239L), chat/service/{chats,messages,
    transitions} deep-splits (crud/batch, read/write, carry helpers).
  - `src/server/start.ts` (398L) split into `init-background-services.ts` + `init-asset-compression.ts`;
    `start.ts` now 212L, both new modules ≤123L. Done 2026-08-12.

## Approach

- Track offender count per split task; the final "0 over 250L" state is the trigger.
- Keep the guard threshold at 250L (soft ceiling; AGENTS.md convention is <200L but 250L is the
  enforced soft limit). Do not lower the threshold as a substitute for splitting.

## Resolution (2026-08-12)

- **0 files over 250L**: `bun run check size-strict` → ✓ PASS. `start.ts` = 212L,
  `init-background-services.ts` = 122L, `init-asset-compression.ts` = 109L.
- Split was behavior-preserving: extracted (1) character-template seeding + external AI
  auto-start (`initBackgroundServices`) and (2) frontend auto-build + asset pre-compression
  - hash injection (`initAssetCompression`). Both take deps as params; no top-level await,
    no TODO placeholders. `smoke.browser.ts` (19/19) + `htmx-alpine.browser.ts` (17/17) still green.
- Remaining `bun run check` failures (`format-dprint` 46 files, `md-lint` 124 issues) are
  pre-existing repo-wide and unrelated to this task.

### Promotion-to-CI (remaining AC)

- [ ] Promote `size:strict` to blocking gate (wire to fail build on new offender)
- [ ] Update `docs/meta/code-practices-improvements/04` to reflect enforcement state

These two items are gate/CI plumbing, not file-splitting; the size debt itself is closed.

## Notes

Only promote to blocking after the split tasks land — otherwise CI goes red on pre-existing debt.
