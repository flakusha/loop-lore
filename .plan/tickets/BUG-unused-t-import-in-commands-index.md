<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Unused `t` import in src/routes/commands/index.ts:19

**Status:** Open
**Priority:** critical
**Priority Tier:** P0
**Source:** git issue `49dd182`
**Area:** build-integrity
**Effort:** Small

## Summary

`src/routes/commands/index.ts:19` imports `t` from the i18n/translation module but never uses it. This is an untracked `tsc` error surfaced in `dev` after the 154+ commit ahead window (the `bun run check` gate was skipped during that period). It is a release-blocking build integrity issue: `bun run typecheck` currently exits non-zero on `dev`.

## Evidence

Source location: `src/routes/commands/index.ts:19`

```ts
import { t } from "..."; // line 19 — unused
```

`tsc`/TypeScript reports the `noUnusedLocals` violation for `t`. This was filed as an individual BUG ticket because each untracked tsc error represents a distinct failure class — in this case an unused import.

## Impact

Build-breaker. `bun run typecheck` fails. `bun run check` gate is not green on `dev`. No regression is expected from the fix itself, but the gate being broken blocks downstream merges.

## Fix

Remove the unused import on `src/routes/commands/index.ts:19` (a one-line deletion of the `import { t } from "...";` statement, or delete just `t` from the import list if other bindings are still used).

## Acceptance Criteria

- [ ] Unused `t` import removed from `src/routes/commands/index.ts:19`
- [ ] `bun run typecheck` exits 0
- [ ] `bun run check` gate green (18/18 — was 18/18 before the ahead window)
- [ ] No regression in downstream tests (`bun test` still passes for `src/routes/commands/`)
- [ ] No unused-import regressions introduced in adjacent files

## Related

- `.plan/backlog/open-build-integrity.md` — cluster parent
- git issue `2c747e0` — sibling tsc error (undefined `chatSectionsRoutes`)
- git issue `7bb2bdf` — sibling tsc error (missing `CompleteGenerationOpts` import)