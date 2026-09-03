<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Missing `CompleteGenerationOpts` import in src/generation/auto-gen/post-store.test.ts:32

**Status:** Open
**Priority:** critical
**Priority Tier:** P0
**Source:** git issue `7bb2bdf`
**Area:** build-integrity
**Effort:** Small

## Summary

`src/generation/auto-gen/post-store.test.ts:32` references the type `CompleteGenerationOpts` but does not import it. This is an untracked `tsc` error surfaced in `dev` after the 154+ commit ahead window (the `bun run check` gate was skipped during that period). It is a release-blocking build integrity issue: `bun run typecheck` currently exits non-zero on `dev`.

## Evidence

Source location: `src/generation/auto-gen/post-store.test.ts:32`

```ts
const opts: CompleteGenerationOpts = { ... }; // line 32 — CompleteGenerationOpts is not imported
```

`tsc`/TypeScript reports `Cannot find name 'CompleteGenerationOpts'` (TS2304). The fix is to add the import for `CompleteGenerationOpts` from its declaring module (likely `src/generation/auto-gen/types.ts` or similar; verify by grep before fixing). Filed as an individual BUG ticket because each untracked tsc error represents a distinct failure class — in this case a missing type import.

## Impact

Build-breaker. `bun run typecheck` fails. `bun run check` gate is not green on `dev`. The test file itself is also unrunnable until the import is restored, so any coverage tied to `post-store.test.ts` is currently silent.

## Fix

At `src/generation/auto-gen/post-store.test.ts:32`, add the missing type import (e.g. `import type { CompleteGenerationOpts } from "./types";` — confirm the source module by grepping the codebase for the original declaration).

## Acceptance Criteria

- [ ] `CompleteGenerationOpts` import added to `src/generation/auto-gen/post-store.test.ts:32` (or whichever line the import should sit on)
- [ ] `bun run typecheck` exits 0
- [ ] `bun run check` gate green (18/18 — was 18/18 before the ahead window)
- [ ] `bun test src/generation/auto-gen/post-store.test.ts` runs and passes
- [ ] No regression in downstream tests across `src/generation/auto-gen/`

## Related

- `.plan/backlog/open-build-integrity.md` — cluster parent
- git issue `49dd182` — sibling tsc error (unused `t` import)
- git issue `2c747e0` — sibling tsc error (undefined `chatSectionsRoutes`)