<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: bun test src full suite is order-dependent cross-file contamination

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:** Plain 'bun test src/' fails nondeterministically on dev AND review-fixes worktree while 'bun run check' coverage-gated unit mode passes: run1 worktree 80 fail (asset-preview, memory/extraction...), run2 79 fail same signature, dev 49 fail completely different set (prompt-improve, messages/guards, chat-context, export-sse) plus an entityTypes preset validation throw during makeConfig (src/config/templates-loader/validation-entity-types.ts:68 via src/routes/chat-context/handlers.test.ts:28). Isolated runs of the failing files always pass. Root cause class: process-global mock.module shadowing / leaked globals across files in one bun process (same class as BUG-export-progress-stream-test-status-assertion-is-flaky, documented there as follow-up). Fix direction: bisect the polluter files (binary search over file subsets), audit tests using mock.module without restore, consider per-file process isolation or bun --isolate; also make handlers.test fixture config satisfy the entityTypes preset validator. Verify: two consecutive 'bun test src/' runs with zero failures.
**Context:** Found 2026-09-26 during the flake review phase of the week-review orchestration: two consecutive full-suite runs in the review worktree plus one on dev; evidence and run outputs in the ticket body above.
**Acceptance Criteria:**
- [x] Polluter files identified via subset bisection
- [x] Three polluters fixed (see Resolution)
- [ ] Two consecutive `bun test src/` runs report zero failures — NOT YET MET


## Resolution

Three distinct polluters, all found by in-place per-test bisection. Two share one
root cause; one was a vacuous test rather than contamination.


### 1. `src/routes/characters/create.test.ts` — module mock of `assets/service/links`

`mock.module` replaces the export for the whole process and Bun has no unmock,
so the no-op `linkAsset` also served `src/routes/messages/forward.test.ts`
(reaching it through `post.ts`'s `assets/service` import), which then wrote zero
`asset_links` and failed. Re-registering the real module in `afterAll` does NOT
fix this — verified: by the time `afterAll` runs, later files have already bound
the stubbed export. Fixed by injection: `HandlerOpts.linkAsset` on the characters
routes, defaulting to the real `linkAsset`.


### 2. `src/routes/chats/turn-skip-routes.test.ts` — module mock of `generation/auto-gen`

Same class, different victim. The stub forced `isLlmGenerationConfigured` to
`true`, and `reply.ts` consults it (line 97) BEFORE the assistant branch, so
`maybeAutoReply` took the generation path and returned `replied: false` —
failing `src/routes/messages/reply-encrypted.test.ts`. This file already had the
`afterAll` restore that demonstrably does not work. Fixed by injection:
`HandlerOpts.isLlmGenerationConfigured` / `.triggerAutoGeneration` on the chats
routes, defaulting to the real hub. The dedup assertions
(`triggerCalls.length` 1 -> still 1 on replay) are preserved and still real.


### 3. `src/validation/schemas/chat.test.ts` — vacuous test, not contamination

The `name_source` case asserted `Value.Check(ChatUpdateBody, {name_source})`,
but `name_source` is a `ChatRenameBody` field; `ChatUpdateBody` has no such
property, so the check passed for ANY input (verified: `totally_unrelated_junk:
12345` also passed). Its result then flipped to false as soon as another file
mounted a route registering a shared schema — which is what made it look
order-dependent. Re-pointed at `ChatRenameBody` with the required `name` field
supplied.

Verified for those three: two consecutive `bun test src/` runs at zero failures
on the branch at the time, plus `bun run typecheck`, `lint:eslint`, and `format`.

## Re-audit 2026-09-30 — NOT fixed, criterion still open

Post-rebase verification on `dev` (`3f79768a5`) shows the suite is still
order-dependent: `bun test src/` exits 1 with roughly 25 failures, and every one
of those files passes when run alone (spot-checked `autonomy-panel.test.ts`,
`auth.test.ts`, `i18n.test.ts`, `lora/routes/discover.coverage.test.ts` — all
PASS in isolation). The earlier "zero failures" result was real for the branch
at the time but was not re-verified after the rebase, and the acceptance claim
was wrong.

Bisect on the current `dev` tree points at four more directories — `src/frontend`,
`src/generation`, `src/routes`, `src/services` — each independently able to
poison `autonomy-panel.test.ts`. One confirmed single-file polluter:
`src/frontend/asset-preview-anchor.test.ts`, which `mock.module("./fe-fetch")`s
the request helper. `src/frontend/alpine/htmx.ts:5` imports `feFetch`, so
`apiFetch` picks up the anchor's stub process-wide, and `autonomy-panel.test.ts`
(which stubs `globalThis.fetch` instead) never reaches its own handler. Same
`mock.module` class as the three above.

Likely a long tail: further `mock.module` sites exist over `fe-fetch` and
`assets/service/links`. Fixing the tail is a separate sweep, not a single patch.
