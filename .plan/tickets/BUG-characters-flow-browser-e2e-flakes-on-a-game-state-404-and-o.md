<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Characters flow browser e2e flakes on a game-state 404 and on browser-process death

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:**

File: `tests/e2e/flows/browser/characters-flow.browser.ts`. Reproduced 2026-10-01 across two independent finalize attempts. Rate: ~1 failure in 6 consecutive isolated runs of this file, same worktree, same code, same env (`E2E_SAFEGUARD=1 HTTP_PROXY= NO_PROXY=*`, exactly what `scripts/run-browser-tests.ts:29-30` sets). It is a peer of two sibling flakes already filed: `BUG-BROWSER-E2E-ASSERTS-ABSENCE-OF-A-DECRYPT-FAILURE-MARKER-ACRO` (8b4b4c1) and `BUG-LOGOUT-BROWSER-E2E-RACES-ITS-OWN-NAVIGATION-AND-NEEDS-RETRY-` (e845b8e).

TWO DISTINCT SIGNATURES, both observed:

(1) 404 on game-state — **VERDICT: TEST bug. NOT a product ordering race.** Decided 2026-10-02; mechanism, evidence and rejected alternatives below —

```
error: Page errors detected (1):
Failed to load resource: the server responded with a status of 404 (Not Found)
  [http://localhost:46009/api/v1/chats/2bd33b70-289d-4a7e-ae05-5af8e36ba3dd/game-state]
      at assert (tests/e2e/helpers/htmx-alpine.ts:138:19)
      at <anonymous> (tests/e2e/flows/browser/characters-flow.browser.ts:223:16)
(fail) Characters flow E2E > Character detail > start chat button in detail modal redirects to chat [668.38ms]
10 pass / 1 fail, 11 tests across 1 file, 4.31s
```

**Superseded hypothesis.** The original reading was "the chat page requests game-state before the chat row or its game-state exists". The first half is false; the second half is by design. Both are disproved below.

**Verified mechanism (every ref read in the fixer's worktree on 2026-10-02).**

1. There is **no product-side ordering race on the chat INSERT**. `src/frontend/pages/characters.ts:175-182` awaits the whole create-chat round trip before it navigates, so the chat row is committed before the browser ever requests the chat page:

```ts
const res = await feFetch("/api/v1/chats", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: jsonBody({ name: "Chat", type: "direct", mode: "direct", participantIds: [id], }),
});
if (res.ok) {
  const data = await res.json();
  location.assign(`/views/chat?chatid=${encodeURIComponent(data.id,)}`,);
}
```

2. The 404 is **by design, and is the second of two 404s in the handler** — `src/routes/game-state.ts:66-70`:

```ts
const access = await checkChatAccess(database, chatId, userId, ctx.userRole ?? null,);
if (!access.ok) { return notFound("Chat not found",); }

const latest = await getLatestGameState({ database, chatId, },);
if (!latest) { return notFound("Game state not found",); }
```

3. A brand-new chat has **no `game_states` row, and will not get one** until an assistant turn emits a fenced ```game-state block. The production INSERT lives in `extractAndStore` (`src/game-state/service.ts:76`), and its only production call site is the message-store path (`src/generation/auto-gen/store-message.ts:189`). Chat creation writes nothing there. The one other writer of the table is test-only: `insertGameStates` (`src/test-utils/insert-helpers.ts:4647`).

4. **The client deliberately treats the 404 as an empty state**, not an error — `src/frontend/alpine/game-canvas/index.ts:101-105`:

```ts
if (res.status === 404) {
  // No state yet for this chat — placeholder, not an error banner.
  component.gameState = null;
  component.analysis = null;
  component.selected = null;
}
```

5. The fetch fires on **every** chat page load, so "the request fired too early" cannot be the mechanism. `src/components/chat/game-canvas.html:10-14` mounts `x-data="gameCanvas()"`; Alpine calls `init()`; `init()` ends in `return component.refresh()` (`src/frontend/alpine/game-canvas/index.ts:71`); `refresh()` resolves the id via `activeChatId()` (`src/frontend/alpine/story-state/derived.ts:28-38`), which falls back to the `?chatid=` query param.

6. The test harness **already exports an allowlist naming this exact endpoint** — `tests/e2e/helpers/htmx-alpine.ts:40-42`, whose docstring at lines 29-39 cites `GET /api/v1/chats/:id/game-state` and this very failure class. The sibling test for the identical flow already opts in, `tests/e2e/flows/browser/navigation.browser.ts:182-184`:

```ts
// The game canvas fetches /api/v1/chats/:id/game-state, which 404s by
// design until the chat has an extracted state; the client handles it.
const errors = trackPageErrors(page, { allowlist: EXPECTED_404_NOISE_ALLOWLIST, },);
```

7. `tests/e2e/flows/browser/characters-flow.browser.ts:212` calls `trackPageErrors(page)` with **no allowlist**, and line 223 asserts the resulting blanket list. That single omission is the bug.

**Why it is intermittent (~1-in-6).** Not request ordering — a harness timing race. `errors.assert()` runs in the `finally` immediately after `chat-header` attaches (`characters-flow.browser.ts:220-223`), while the game-state 404 is recorded by the `page.on("response", ...)` handler (`htmx-alpine.ts:112-118`). Whether that response event lands before the assert is a coin flip on a ~150ms gap. Measured with a throwaway probe over 5 isolated runs: `chat-header` attached at 696-788ms and the game-state 404 arrived at 821-952ms — 0 errors recorded at the assert point, 1 error present 2500ms later, in 5/5 runs.

**Reproduction attempt (honest).** 10 isolated runs of the single file with the exact env `scripts/run-browser-tests.ts:29-30` sets (`E2E_SAFEGUARD=1 HTTP_PROXY= NO_PROXY=*`): **NOT REPRODUCED — 11 pass / 0 fail on all 10 runs.** The probe is the substitute evidence and is stronger than a red run: it observes the 404 on 5/5 runs and captures the response body.

```
404 @952ms .../api/v1/chats/<id>/game-state BODY={"error":"Game state not found","code":"NOT_FOUND","meta":{"api_version":"1"}}
```

That string is `game-state.ts:70` (`"Game state not found"`), **not** `game-state.ts:67` (`"Chat not found"`). `checkChatAccess` therefore passed: the chat row exists and is accessible, and the 404 is the designed empty-state answer.

**FIX DIRECTION (decided): pass `EXPECTED_404_NOISE_ALLOWLIST` at `characters-flow.browser.ts:212`**, mirroring `navigation.browser.ts:184`. One line plus the comment that explains why. No `src/` change.

(2) browser process reaped mid-file — **VERDICT: INDEPENDENT of signature (1). Split into its own ticket.**

```
(fail) Characters flow E2E > Create character > create character modal opens [5000.09ms]
  this test timed out after 5000ms
error: newPage: Protocol error (Target.createTarget): Not supported
error: click: Target page, context or browser has been closed
killed 1 dangling process
3 pass / 8 fail / 1 error
```

Suggesting host resource pressure during the browser suite. **Decided 2026-10-02: independent of signature (1) — see Context.**

NOT the cause: the rate limiter. `grep -c "429\|Rate limit\|rate_limited_total"` against the failing gate log returns 0, and `scripts/run-browser-tests.ts:29-30` sets `E2E_SAFEGUARD: "1"` on every spawned child unconditionally (spread-then-overwrite), so the safeguard is not implicated.

**The suite-stabilization question is ANSWERED (2026-10-02): no shared stabilization — split signature (2) into its own ticket.** Evidence in Context.

**Context:**

Decision made 2026-10-02 by root-causing this ticket before writing any fix. Ticket decision only: no `src/` or `tests/` file was modified.

**Verdict, per signature.**

| Signature | Verdict | Fix belongs in |
| --- | --- | --- |
| (1) game-state 404 | **TEST bug** | `characters-flow.browser.ts:212` — opt into the existing allowlist |
| (2) browser process reaped | **not a loop-lore defect**; harness/host-level | its own ticket, out of scope here |

**Constraints on the fixer.**

- The 404 is a designed contract (`game-state.ts:70` plus `docs/spec/game-canvas.md`). Do not silence it by making the endpoint return `200`-with-null or by suppressing the fetch — that changes the documented API for every consumer to quieten one test.
- `errors.assert()` in a `finally` sits at the last locator wait, so the no-page-errors contract is unreliable in **both** directions: it produced 5/5 false passes and ~1-in-6 false fails during this investigation. Judge the fix on "does the game-state 404 stop flacking", not on "does the assert get stricter".

**Alternatives considered and rejected.**

1. **Fix the product ordering (await the insert before navigating).** Rejected: nothing left to await. `characters.ts:175-182` already awaits `feFetch` and `res.json()` before `location.assign`, and the probe shows the handler answers `"Game state not found"` — i.e. `checkChatAccess` already found the chat row. The insert is committed first, every run.
2. **Fix the test by polling for the game-state row, mirroring `encryption-flow.browser.ts:154-175`.** Rejected — the precedent does not transfer and following it would actively break the test. `encryption-flow`'s poll is correct there because that test just triggered a write and the poll waits for *that* INSERT, asserting on the found row rather than on "whatever is newest". Here no write is pending: a new chat gains a `game_states` row only after an assistant turn emits a fence, which this test never triggers. Polling would spin to the 15s deadline and then fail. Same-sounding symptom, different mechanism — this is the one alternative most likely to be chosen by mistake, so it is called out explicitly.
3. **Widen to a retry, or treat the 404 as expected without an allowlist.** Rejected as the primary fix: retrying a designed 404 retries a permanent condition. "Treat as expected" is right but must be scoped to the designed 404 via `EXPECTED_404_NOISE_ALLOWLIST`, not blanket-suppressed — a blanket ignore would also swallow a real 500. Retry does remain the right shape for the sibling logout ticket (e845b8e), where the abort is genuinely transient; that is why the two must not be merged.
4. **Treat (1) and (2) as one shared suite-stabilization problem.** Rejected. (1) is one stray console line from a healthy page; (2) is the browser process dying, failing 8 of 11 tests with `Target.createTarget: Not supported` and `Target page, context or browser has been closed`. Different mechanisms, different blast radius, different fixes. Further, a grep for `dangling process` across `src/`, `tests/`, `scripts/` **and the entire `node_modules` tree returns no matches** — the `killed 1 dangling process` line is emitted by the test runner / host reaper, not by loop-lore code, so there is no loop-lore call site to stabilize.
5. **Seed a `game_states` row for the new chat so the endpoint returns 200.** Rejected — the shape the test needs makes it impossible. The chat id is minted server-side and is only revealed in the POST response (`characters.ts:181`, `data.id`), so there is no id to seed before the navigation, and seeding afterwards would fabricate the very state the test is supposed to reach naturally. Recorded because the helper does exist (`src/test-utils/insert-helpers.ts:4647`, `insertGameStates`) and a fixer hunting for an allowlist-free option will find it first.

**Answer on signature (2) and suite stabilization.**

Split signature (2) into its own ticket, scoped to browser-process lifetime and host resource pressure during the browser suite. A serialized launch or a per-file browser restart is a plausible direction, but there is no evidence for either yet: that ticket needs Chromium stderr and host memory/CPU captured during a failing run, which this ticket cannot supply. Keep it separate because one change cannot fix both signatures, and because bundling them would let the cheap (1) fix mask the expensive (2) one.

On the "three files flake at ~1-in-6, maybe the suite needs a shared fix" note: the three rates are coincidental, not correlated. This file's 1-in-6 is a ~150ms response-vs-assert gap (a fact about *this* test); the logout sibling's is a navigation abort (its ticket fixes it with retry-on-abort around the bare `waitForURL` at `auth-session.browser.ts:81`); the encryption sibling's is a body-read scoping issue (its ticket scopes the whole-`document.body.textContent` read to the secret's own bubble). None is a suite-level launch or timeout problem, so a shared stabilization would be an unevidenced change fixing none of them. File each on its own mechanism; revisit a shared story only if a genuinely shared cause is later observed.

**Evidence retained.** The recorded 2026-10-01 failure output for both signatures is preserved verbatim above; nothing was deleted. The 10-run non-reproduction and the 5-run probe are additions, not replacements.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
