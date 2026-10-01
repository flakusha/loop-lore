<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Characters flow browser e2e flakes on a game-state 404 and on browser-process death

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

File: `tests/e2e/flows/browser/characters-flow.browser.ts`. Reproduced 2026-10-01 across two independent finalize attempts. Rate: ~1 failure in 6 consecutive isolated runs of this file, same worktree, same code, same env (`E2E_SAFEGUARD=1 HTTP_PROXY= NO_PROXY=*`, exactly what `scripts/run-browser-tests.ts:29-30` sets). It is a peer of two sibling flakes already filed: `BUG-BROWSER-E2E-ASSERTS-ABSENCE-OF-A-DECRYPT-FAILURE-MARKER-ACRO` (8b4b4c1) and `BUG-LOGOUT-BROWSER-E2E-RACES-ITS-OWN-NAVIGATION-AND-NEEDS-RETRY-` (e845b8e).

TWO DISTINCT SIGNATURES, both observed:

(1) 404 race on game-state —

```
error: Page errors detected (1):
Failed to load resource: the server responded with a status of 404 (Not Found)
  [http://localhost:46009/api/v1/chats/2bd33b70-289d-4a7e-ae05-5af8e36ba3dd/game-state]
      at assert (tests/e2e/helpers/htmx-alpine.ts:138:19)
      at <anonymous> (tests/e2e/flows/browser/characters-flow.browser.ts:223:16)
(fail) Characters flow E2E > Character detail > start chat button in detail modal redirects to chat [668.38ms]
10 pass / 1 fail, 11 tests across 1 file, 4.31s
```

The chat detail page appears to request `/api/v1/chats/<id>/game-state` before the chat row or its game-state exists. This one may be a REAL product-side race rather than pure test flake — the fix direction may be in the request ordering, not only the test.

(2) browser process reaped mid-file —

```
(fail) Characters flow E2E > Create character > create character modal opens [5000.09ms]
  this test timed out after 5000ms
error: newPage: Protocol error (Target.createTarget): Not supported
error: click: Target page, context or browser has been closed
killed 1 dangling process
3 pass / 8 fail / 1 error
```

Suggesting host resource pressure during the browser suite.

NOT the cause: the rate limiter. `grep -c "429\|Rate limit\|rate_limited_total"` against the failing gate log returns 0, and `scripts/run-browser-tests.ts:29-30` sets `E2E_SAFEGUARD: "1"` on every spawned child unconditionally (spread-then-overwrite), so the safeguard is not implicated.

Also note for whoever fixes it: three separate browser e2e files now flake independently at ~1-in-6. Consider whether the suite needs a shared stabilization (per-file timeout budget, browser restart between files, or serialized launch) rather than three one-off patches — that is a judgement call for the fixer, but the pattern is worth naming.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
