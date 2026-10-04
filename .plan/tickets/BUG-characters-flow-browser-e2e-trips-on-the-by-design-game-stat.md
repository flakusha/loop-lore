<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: characters-flow browser e2e trips on the by-design game-state 404

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

The defect is real and fully diagnosed. The fix is IMPLEMENTED in
`p3-verify-close-batch` @ `7fb4e0799` ("fix(test): detect isolation directly;
scope e2e page assertions") — that commit is not yet merged to dev.

Scope note: `7fb4e0799` broadens the fix to ALL 11 `trackPageErrors` call sites
in `characters-flow.browser.ts`, not just the `:212` site this ticket originally
described. The broader scope is correct: the by-design `/game-state` 404 is a
property of the chat page, so any test in the file that navigates to a chat can
trip the same blanket assert, and scoping the suppression to a single call site
would leave the identical defect latent in the other ten.

What:
`tests/e2e/flows/browser/characters-flow.browser.ts:212` called
`trackPageErrors(page)` with no allowlist. The blanket `errors.assert()` in the
`finally` at `:223` then failed on the by-design 404 from
`GET /api/v1/chats/:id/game-state`, tripping an otherwise-green test.

Why this 404 is by design, not a product defect:
- `src/routes/game-state.ts:66-70` has two distinct 404 branches. `checkChatAccess` passes (the chat row exists and is owned by the actor), so the failure is the *second* branch, "Game state not found", confirmed by the captured response body `{"error":"Game state not found","code":"NOT_FOUND","meta":{"api_version":"1"}}`.
- `src/frontend/alpine/game-canvas/index.ts:101-105` deliberately reads that 404 and renders a placeholder / empty state rather than an error.
- The 404 simply exists until the chat has an extracted ```game-state fence, which this test never creates.
- The canvas is chat-only: `src/views/chat.html:28` is the sole view that includes `{{> chat/game-canvas.html }}`, so only tests that reach `/views/chat` can produce this response.

Why it is intermittent:
The blanket assert runs in the `finally` immediately after `chat-header` attaches (`characters-flow.browser.ts:220-223`), but the 404 is recorded by the `page.on("response", ...)` handler (`htmx-alpine.ts:119-125`), which lands roughly 2500ms later. Measured by probe: `chat-header` attached at 696-788ms, 404 arrived at 821-952ms, 0 errors recorded at the assert point and 1 error present 2500ms later, 5/5 runs. Whether the response event lands before or after the assert is a scheduling race, which is why the failure is roughly 1-in-6 rather than deterministic.

Why the fix is the existing precedent, not a new mechanism:
- The harness already exports `EXPECTED_404_NOISE_ALLOWLIST` at `tests/e2e/helpers/htmx-alpine.ts:47-49`.
- Its docstring (`htmx-alpine.ts:29-46`) names this exact endpoint and this exact failure class.
- The identical sibling flow already opts in: `tests/e2e/flows/browser/navigation.browser.ts:182-184` passes `trackPageErrors(page, { allowlist: EXPECTED_404_NOISE_ALLOWLIST, },)`.

Rejected alternatives:
- Polling for the game-state row (mirroring `encryption-flow.browser.ts:154-175`) is WRONG here and would actively break the test: no write is pending and the row never appears, so the poll spins to its 15s deadline and then fails.
- Retry treats a permanent condition as transient, so it wastes time and still fails.
- A blanket ignore (suppress all resource errors) would also swallow a real 500, hiding genuine product defects.

## Verification evidence

Both results below were produced against a NARROWER single-site diff (allowlist applied to `:212` only), not against `7fb4e0799`'s broader 11-site version.

1. Flake runs — 15/15 clean. The file run in isolation 15 times under the exact env `scripts/run-browser-tests.ts:29-30` sets (`E2E_SAFEGUARD=1 HTTP_PROXY= NO_PROXY=*`) via `bun test --max-concurrency=1 ./tests/e2e/flows/browser/characters-flow.browser.ts`: 15 passed, 0 failed. A single green run would not have been evidence for a ~1-in-6 flake.
2. Negative-space harness (acceptance criterion 3) — all 9 cases behaved correctly. The real `trackPageErrors` was driven with the allowlist across 9 cases: both 404 forms (console message and `response` event) were suppressed and did not trip `assert()`, while a 500 response, a 500 console message and a `pageerror` were each recorded AND still made `assert()` throw. This is the proof that the allowlist is scoped rather than a blanket suppressor.

## Open verification gap

The 15 runs and the 9-case harness were executed against the narrower single-site diff. `7fb4e0799`'s broader 11-site version has NOT been run in isolation by anyone. The extra ten sites only gain 404 suppression, which cannot introduce a new failure, but that is reasoning, not measurement. Re-running the file 15x against `p3-verify-close-batch` would close this gap.

## Scope caveat for future fixers

`7fb4e0799`'s file-scope comment claims `EXPECTED_404_NOISE_ALLOWLIST` matches on response STATUS, not URL. This is incorrect — the regex on dev (`htmx-alpine.ts:48`) includes the URL path `/api/v1/chats/.../game-state`, so a 404 from any other endpoint would NOT be excused. Non-404 responses, network failures and JS page errors are unaffected and still fail. The fix commit's comment should be corrected when it merges.

Acceptance criteria:
1. The file's blanket assert no longer fails on the by-design game-state 404.
2. The fix is the scoped allowlist only, no `src/` change.
3. A genuine unexpected error still fails the test — the allowlist must not become a blanket suppressor. (Satisfied: see negative-space harness above.)
4. Verified by running the file in isolation repeatedly (at least 15 runs), not by a single green run. (Satisfied for the single-site diff; see the open verification gap for the 11-site version.)

Reference: sibling diagnosis branch `determine-characters-flake-root-cause` (verdict: TEST bug, one line, no `src/` change).

**Context:**

Superseded implementation note: an earlier narrower fix of this ticket — allowlisting only `characters-flow.browser.ts:212` — was dropped as redundant. `7fb4e0799` contains every functional line it added, plus the other ten call sites, so landing both would have meant landing a strictly narrower fix for the same defect and then eating a second conflict when `p3-verify-close-batch` merges.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
