<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Reconcile `*.ts` import extensions (user-seeding session)

**Status:** ⬜ Open — follow-up for a future session
**Priority:** Low
**Effort:** Small
**Epic:** epic-deno-support (future Deno parity)

## Summary

During the `user-seeding-role-expansion` worktree session (2026-08-17), a
handful of import specifiers were written with an explicit `*.ts` file
extension (e.g. `from "../db/enums.ts"`) to silence the Deno LSP
`no-sloppy-imports` warning on newly created files.

These `.ts`-suffixed imports were **reverted to extension-less** (the repo-wide
convention) at the user's direction, because `deno.json` is for **future Deno
support only** and is not a current requirement. The Bun runtime + TypeScript
toolchain resolve extension-less imports natively; the entire existing codebase
uses extension-less relative imports (verified: zero `.ts`-suffix imports in
`src/`).

This ticket exists to (a) record that the deviation happened, and (b) confirm
whether a future session should re-introduce `*.ts` extensions (or handle
`no-sloppy-imports`) when Deno support is actually pursued.

## Current State

- **Files touched with `*.ts` extensions this session:** `src/users/permissions.ts`,
  `src/users/roles.ts`, `src/users/index.ts`, `src/users/permissions.test.ts`,
  `src/config/schema/seeding.ts`, `src/seeding/users.ts`, `src/seeding/index.ts`.
- **Resolution applied:** all reverted to extension-less imports (repo convention).
  Tests (`bun test src/users/permissions.test.ts` → 22/22) and `tsc --noEmit`
  remain green after the revert.

## When to Revisit

- **If/when Deno support is actually pursued** (`epic-deno-support.md`): the
  Deno LSP's `no-sloppy-imports` rule requires explicit extensions (or a lint
  override). Decide then whether to:
  1. Add `.ts` extensions repo-wide (large, mechanical codemod), or
  2. Configure a `deno.json` lint rule to relax `no-sloppy-imports`, keeping
     the extension-less convention, or
  3. Add explicit Deno `rewriteRelativeImportExtensions` / import-maps handling.
- **Before then:** no action needed — extension-less is correct for Bun.

## Acceptance Criteria

- [ ] No `*.ts` extension imports exist in the committed tree (verified post-revert)
- [ ] Decision recorded here for the future Deno-support session
- [ ] (Future) Either extend imports repo-wide or relax the Deno lint rule

## Notes

- `deno.json` is present but for **future Deno support only**; not a current
  runtime/lint requirement.
- The `no-sloppy-imports` Deno LSP warning fires on extension-less imports but
  does **not** fail the current `bun run check` gate (only pre-existing
  `lint - ts manifest-dupe` and `size - strict` fail, unrelated to this).