# TASK-size-strict-debt: Close size-strict debt and promote size guard to CI gate

**Status**: open
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
- `src/server/start.ts` (398L) deliberately kept intact — untested production bootstrap, no safety net.

## Approach

- Track offender count per split task; the final "0 over 250L" state is the trigger.
- Keep the guard threshold at 250L (soft ceiling; AGENTS.md convention is <200L but 250L is the
  enforced soft limit). Do not lower the threshold as a substitute for splitting.

## Acceptance Criteria

- [ ] `bun run check` size-strict reports 0 files over 250L (excluding tests/migrations/generated)
- [ ] Size check wired to fail the build (blocking) when an offending file is introduced
- [ ] `docs/meta/code-practices-improvements/04` updated to reflect actual enforcement state

## Notes

Only promote to blocking after the split tasks land — otherwise CI goes red on pre-existing debt.
