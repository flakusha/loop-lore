<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Undefined `chatSectionsRoutes` referenced at src/app/register-plugins.ts:150

**Status:** Open
**Priority:** critical
**Priority Tier:** P0
**Source:** git issue `2c747e0`
**Area:** build-integrity
**Effort:** Small

## Summary

`src/app/register-plugins.ts:150` references `chatSectionsRoutes`, but no such symbol is imported or defined in the file. This is an untracked `tsc` error surfaced in `dev` after the 154+ commit ahead window (the `bun run check` gate was skipped during that period). It is a release-blocking build integrity issue: `bun run typecheck` currently exits non-zero on `dev`.

## Evidence

Source location: `src/app/register-plugins.ts:150`

```ts
app.use(chatSectionsRoutes); // line 150 — chatSectionsRoutes is not defined/imported
```

`tsc`/TypeScript reports `Cannot find name 'chatSectionsRoutes'` (TS2304). The fix may be either to add the missing import (e.g. `import { chatSectionsRoutes } from "...";`) or to remove the dead `app.use(...)` call if the route module was deleted upstream. Filed as an individual BUG ticket because each untracked tsc error represents a distinct failure class — in this case an undefined symbol reference.

## Impact

Build-breaker. `bun run typecheck` fails. `bun run check` gate is not green on `dev`. No regression is expected from the fix itself, but the gate being broken blocks downstream merges.

## Fix

At `src/app/register-plugins.ts:150`, either (a) add the missing `import { chatSectionsRoutes } from "<correct-module-path>";` line if the route module exists and the registration was orphaned, or (b) delete the dead `app.use(chatSectionsRoutes);` line if the route module was intentionally removed upstream. Choose by inspecting whether a chat-sections route module exists in `src/routes/`.

## Acceptance Criteria

- [ ] `chatSectionsRoutes` reference at `src/app/register-plugins.ts:150` resolved (either properly imported or removed)
- [ ] `bun run typecheck` exits 0
- [ ] `bun run check` gate green (18/18 — was 18/18 before the ahead window)
- [ ] If the route was removed upstream: no orphan `app.use(...)` calls left in `src/app/register-plugins.ts`
- [ ] If the route was kept: registration actually mounts the routes (smoke test of `/chat-sections/*` paths)

## Related

- `.plan/backlog/open-build-integrity.md` — cluster parent
- git issue `49dd182` — sibling tsc error (unused `t` import)
- git issue `7bb2bdf` — sibling tsc error (missing `CompleteGenerationOpts` import)