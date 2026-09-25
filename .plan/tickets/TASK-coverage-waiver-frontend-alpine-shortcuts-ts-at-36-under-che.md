<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Coverage waiver: frontend/alpine/shortcuts.ts at 36% under check gate

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

## What

src/frontend/alpine/shortcuts.ts is at 36.36% line coverage in diff-files
mode. The gate's frontend:src/frontend/alpine/shortcuts.ts floor must be
set to ≤36 to land changes to this module until a DOM harness is available.

## Why

shortcuts.ts contains a top-level document.addEventListener('keydown', ...)
that registers the global keymap listener. bun:test cannot fire keyboard
events without a DOM; the listener body (~80 lines including the g-prefixed
sequence handler and Ctrl+B/N/L/K branches) is unreachable from a unit-test
harness.

The pre-existing test file (shortcuts.test.ts) covers the export surface
(DEFAULT_KEYMAP, getKeymap, isKeyboardNavEnabled, dispatchKeynavAction)
which is a small constant/factory payload relative to the listener body.
This was true before the current change — adding the registerKeynavHandler
API and dispatchKeynavActionToHandlers did not lower coverage; both new
functions are fully covered by 6 new unit tests.

The right long-term fix is Playwright DOM coverage (per the existing waiver
notes on the frontend module). Until then, the diff-files gate is
structurally unpassable for any change to shortcuts.ts.

## Where

- src/frontend/alpine/shortcuts.ts
- scripts/check/coverage.mjs (WAIVERS map)
- .plan/tickets/TASK-coverage-waiver-frontend-alpine-shortcuts-ts-at-36-under-che.md (self)

## Learned

DOM-bound modules under src/frontend/alpine/* that own a top-level
document.addEventListener need per-file waivers until Playwright DOM-coverage
is wired. The same pattern already applies to src/frontend/alpine/htmx.ts
(floor 25) and src/frontend/fe-fetch.ts (floor 60).


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
