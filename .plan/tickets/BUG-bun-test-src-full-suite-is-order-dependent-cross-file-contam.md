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

## Root cause established 2026-10-01 — the gate detects the wrong thing

Contamination is a property of the INVOCATION, not of any one file. A bare
`bun test src/` runs all 1208 files in one process with one module registry;
`mock.module` is process-global and cannot be unmocked, so leaks are
structural. Per-file isolation removes the class entirely.

Three facts, each measured on this branch:

1. The canonical gate `bun run test:unit` (`bun test --parallel=4 src/
   --isolate`; `--parallel` implies `--isolate`) is green:
   **13295 pass / 2 skip / 0 fail / 1208 files / ~85s**.
2. A minimal 2-file reproduction (`.tmp/repro/`: one file `mock.module`s a
   shared module, the next asserts it still gets the real one) passes only
   under `--isolate`. Adding `isolate = true` to `bunfig.toml` did NOT take
   effect — Bun 1.4.2 ignores that key. Isolation therefore cannot be made the
   default by configuration; it has to be on the command line.
3. Bare `bun test src/` fails 57 and takes 232s (3x the isolated run).

### Fixed here: CI was silently skipping 213 tests

`ISOLATED` keyed on `npm_lifecycle_event`, a proxy for "the gate ran". CI
(`.github/workflows/ci.yml:78`) runs `bun test --parallel=4 src/ --isolate`
directly, with no npm lifecycle var — so every guarded suite reported
"not isolated" for a genuinely isolated run and skipped.

`ISOLATED` now keys on `BUN_TEST_WORKER_ID`, which Bun sets inside every
`--parallel` worker. Measured on the CI invocation shape:

Both rows below were measured on the SAME base commit (`51da6e19e`), in one
worktree, flipping only the `ISOLATED` expression. An earlier revision of this
ticket quoted a before/after pair taken on two different dev bases (other
sessions landed commits between the runs), which is not a valid delta; the
numbers are replaced.

| invocation | before | after |
| --- | --- | --- |
| `bun test --parallel=4 src/ --isolate` (ci.yml) | 13105 pass / **213 skip** / 0 fail | 13216 pass / **89 skip** / 0 fail |
| `bun run test:unit` (canonical gate) | 13295 pass / 2 skip / 0 fail | unchanged, 0 fail |
| `bun test src/` (bare) | 57 fail | 57 fail (unchanged, correctly non-isolated) |

Skips fall by 124 and passes rise by 111, with zero failures on both sides and
the same 1209 files. The `after` variant is deterministic: two consecutive runs
both reported 13216 pass / 89 skip / 0 fail / 13305 tests. A junit per-file diff
attributes the change to 45 files, every one of them in the guarded
`describeOrSkip` class, each finishing at zero skips and zero failures.

One loose end, recorded rather than papered over: the collected test TOTAL moves
13318 -> 13305, i.e. -13, and that does not balance against the -124 skips. The
junit diff localises the -13 to exactly six files that go from wholly-skipped to
wholly-run (`routes/character-emotion-avatars` -4, `generation/prompt-route` -2,
`emotion-avatar-service/index` -2, `emotion-avatar-service/run-batch-generation`
-1, `routes/telemetry-disabled` -2, `scripts/migrate-character-legacy` -2). Each
of those files' skipped-suite junit record reports two more tests than the file
actually declares — `telemetry-disabled.test.ts` declares exactly 6 `test()` calls
and junit reports `tests=8` while skipped versus `tests=6` while running — so the
gap looks like skipped-container accounting rather than tests that stopped being
collected. That reading is consistent with a spot check on the guarded
directories, which conserves exactly (78 tests before, 78 after, 28 skips becoming
28 passes), but it is not independently proven and no test is reported missing.

Three files under `src/native/` (`blake3-gaps`, `loader-dlopen`, `zstd-gaps`)
reimplemented the same detection locally against a hardcoded allow-list of
script names; they now import the shared helper.

### Still open: the bare-`bun test src/` criterion

Bare runs remain order-dependent. The remaining leaks are unguarded
`mock.module` sites — `src/frontend/alpine/*.test.ts` (~22 files) mock
`"./htmx"`, and ~5 `src/frontend/*.test.ts` mock `"./fe-fetch"`. Neither mock
is necessary: `apiFetch` -> `feFetch` -> `safeFetch` -> `globalThis.fetch`, so
stubbing `globalThis.fetch` reaches the same seam without a process-global
module mock. Converting that class makes those suites order-independent
*everywhere* rather than skipping them outside the gate. Remaining vectors
after that class (`routes/admin/*`, `auth.test.ts`, `probes.test.ts`,
`safe-fetch-with-retry`, `lora/routes/discover.coverage`, `i18n.test.ts`)
still need individual bisection.
