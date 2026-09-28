<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Navigation e2e "creates new chat" fails on an unhandled 404 page error

**Summary:** The `navigation.browser.ts` case "creates new chat and redirects to chat page" fails the `e2e - browser (baseline)` gate. Every assertion passes, but a `console.error: Failed to load resource: 404` is recorded and `errors.assert()` in the `finally` block throws.
**Context:** `trackPageErrors` captures the message but not the failing URL, so the 404 is unattributed. The test also invokes `loadNewChatPage?.()` manually because `page.goto()` bypasses `htmx:load`, so the request may be a harness artifact rather than a real user-facing defect.
**Acceptance Criteria:** The failing request is identified by URL; either the resource is served or the harness-induced request is excluded; the browser baseline gate passes with all 34 files green.

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Type:** Bug
**Tags:** e2e, testing, browser, tooling

## Summary

`tests/e2e/flows/browser/navigation.browser.ts` — the "New Chat navigation >
creates new chat and redirects to chat page" case fails in the `e2e - browser
(baseline)` gate. The assertions all pass (the chat is created and the URL
becomes `/views/chat`), but the `finally` block calls `errors.assert()`, and one
`console.error: Failed to load resource: the server responded with a status of
404 (Not Found)` was recorded during the run, so the test throws.

## Evidence

Run on a clean `dev` checkout:

```
$ bun test ./tests/e2e/flows/browser/navigation.browser.ts
error: Page errors detected (1):
console.error: Failed to load resource: the server responded with a status of 404 (Not Found)
  at assert (tests/e2e/helpers/htmx-alpine.ts:60:19)
  at <anonymous> (tests/e2e/flows/browser/navigation.browser.ts:196:16)
(fail) Navigation E2E > New Chat navigation > creates new chat and redirects to chat page
 12 pass
 1 fail
```

## Root cause (established 2026-09-28)

The 404 was a **concurrency race in the shared frontend build**, not a product
defect. Fixed by `test(e2e): invalidate dist hash before rebuild`.

`tests/e2e/helpers/browser-frontend-build.ts` had every browser worker sharing
one `dist/public` build:

- `isReady()` returned true while a hash file matched the current sources —
  including while a worker was mid-`cpSync` overwriting that build.
- `acquireBuildLock(lockPath, isReady)` loops `while (!isReady())`, so a worker
  arriving during a rebuild saw `isReady()` true, skipped the lock entirely, and
  returned `distPublic` at the top of the function.
- That worker then served files another process was still writing, producing the
  intermittent 404 recorded in the console.

The fix unlinks `.build-hash` **before** rebuilding, so `isReady()` is false for
the duration and every other worker blocks in `acquireBuildLock` until the new
build lands.

Reproduced pre-fix as intermittent: on an untouched `dev`, three consecutive
runs of `navigation.browser.ts` gave `12 pass 1 fail`, then `13 pass`, then
`13 pass`. Post-fix, the full suite reports `Browser suite passed: 34 files`.

## Remaining improvement

`trackPageErrors` still records only `message.text()` and never the request URL,
so any *future* unattributed 404 will be just as hard to diagnose. Consider
including `message.location()` or a `page.on('response')` non-2xx logger so the
failing resource is named in the assertion message.

## Re-verification 2026-09-29: root cause fixed, gate still red

The `4156e2bf4` fix is present on `dev` and does what the ticket says: the helper
unlinks `.build-hash` *before* `bun run build:frontend` (`tests/e2e/helpers/browser-frontend-build.ts:96`),
so `isReady()` reports false for the whole rebuild and other workers block in
`acquireBuildLock`.

But the gate is **not** green, and the earlier "34 files green" note above does not
reproduce. Measured on a clean `dev` at `38d95ac01`:

```
$ E2E_SAFEGUARD=1 bun run scripts/check-parallel.mjs --gates 'e2e - browser (baseline)'
FAIL: e2e - browser (baseline)
  Browser suite failed: 1/34 files failed:
   - ./tests/e2e/flows/browser/navigation.browser.ts

$ E2E_SAFEGUARD=1 bun test ./tests/e2e/flows/browser/navigation.browser.ts
 13 pass / 0 fail   (13.55s)
```

So the failure is concurrency-only: the same file passes standalone and fails inside
the 34-file parallel suite. `acquireBuildLock` closes the *build* window but the
suite still shares one `dist/public` tree across workers, so a worker can be reading
files while a different worker's `cpSync` is mid-write. The unlink-invalidate fixed
the symptom's most common trigger, not the shared-mutable-output root cause.

The first acceptance criterion is therefore the right next step: without the failing
URL in the assertion, there is no way to tell which resource 404s under load, and no
way to tell whether it is `alpine-init.js`, a lazily-fetched view partial, or a font.
Ticking the criteria on a single green standalone run would be pinning a flaky test,
not closing the defect.

## Acceptance Criteria

- [ ] The failing request is identified (URL logged by the helper)
- [ ] Either the missing resource is provided, or the test correctly excludes a
      harness-induced request
- [ ] `bun run scripts/check-parallel.mjs --gates 'e2e - browser (baseline)'` passes
- [ ] All other 33 browser files stay green

## Notes on provenance

Found while landing `024_memory_embeddings_cascade_fk`. Unrelated to that change
— the failure is baseline on `dev`.


git issue: b99af61
