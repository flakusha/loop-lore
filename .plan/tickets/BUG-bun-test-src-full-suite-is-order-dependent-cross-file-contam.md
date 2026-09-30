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
- [x] Contamination fixed or per-file isolation wired
- [x] Two consecutive `bun test src/` runs report zero failures


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

Verified: two consecutive `bun test src/` runs at zero failures, plus
`bun run typecheck`, `bun run lint:eslint`, and `bun run format`.
