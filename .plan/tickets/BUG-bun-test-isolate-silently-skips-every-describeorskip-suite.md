<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: bun test --isolate silently skips every describeOrSkip suite

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**


**Root cause:**

`src/test-utils/isolate-only.ts:20` defines:

```ts
export const ISOLATED = process.env.BUN_TEST_WORKER_ID !== undefined;
```

The file's own comment (lines 8-13) claims `--parallel` implies `--isolate` and therefore sets the var. That claim is wrong: `BUN_TEST_WORKER_ID` is only set inside `--parallel` worker processes, not inside `--isolate` runs. Consequently:
- `describeOrSkip` → `describe.skip` under `--isolate` and under bare `bun test`
- `describeOrSkipStrict` also skips (it additionally keys on `npm_lifecycle_event === 'test:unit'`, which the CI gate runs as `bun test src/ --isolate` without an npm lifecycle var)

**Measured evidence on src/frontend/alpine/chat-sections.test.ts (67 test cases):**

| Run | Result |
|-----|--------|
| `bun test src/frontend/alpine/chat-sections.test.ts` | **0 pass / 67 skip** |
| `bun test --isolate src/frontend/alpine/chat-sections.test.ts` | **0 pass / 67 skip** |
| `bun test --parallel=2 src/frontend/alpine/chat-sections.test.ts` | **67 pass** |

The suite reports green (no failures, no errors) in both non-parallel modes while executing zero assertions.

**Why this is dangerous:**

- A developer or agent runs `bun test src/` or `bun test --isolate src/` — the natural, intended way to run a local suite.
- The run exits 0 with a green summary.
- Zero assertions executed; no regression is detected.
- The silent skip is indistinguishable from a genuinely passing suite.

**Fix options (do not implement in this ticket):**

1. **Detect isolation directly rather than proxying for `--parallel`** — Bun's `--isolate` flag runs each file in a fresh module registry. A reliable probe (e.g. checking if the module graph is fresh per file) would allow `describeOrSkip` to fire correctly under both `--isolate` and `--parallel`.

2. **Make the skip loud** — when a `describeOrSkip`-guarded suite is skipped because isolation is absent, emit a `console.warn` or `test('ISOLATION_REQUIRED')` that always runs and fails under non-isolated conditions. This prevents a silent green from being mistaken for a passing suite.

Option 1 is preferred; option 2 is the safer short-term signal.


**Context:**

The isolation guard was introduced to let tests that replace shared modules via `mock.module` run safely in CI, which runs `bun test --parallel=4 src/ --isolate`. The guard was keyed on `BUN_TEST_WORKER_ID` as a proxy for isolation, on the theory that `--parallel` implies `--isolate`. That implication holds in CI but not in local development: a developer running `bun test --isolate src/` locally gets `--isolate` without `--parallel`, so `BUN_TEST_WORKER_ID` is never set and every guarded suite silently skips.

Constraints on any fix:
- The `mock.module` mocks that motivate the guard do genuinely need isolation — they poison the module registry and cause cross-file failures in shared-process runs. A naive fix that removes the guard entirely would break CI.
- `npm_lifecycle_event` cannot be used as the signal (the original comment explicitly notes CI sets `bun test --parallel=4 src/ --isolate` with no npm lifecycle var, so that proxy was rejected).
- `describeOrSkipStrict` additionally must not fire under `test:coverage` (which runs `bun test src/` in one shared process and has its own fixed-fake provider stubs that must not be clobbered). Any direct detection of `--isolate` must not fire under coverage runs either.

Alternative considered: drop the guard entirely and let shared-process runs fail on `mock.module` collisions. Rejected — CI must keep parallel+isolate for performance, and forcing CI to shared-process would slow gates.

The `feFetch` error-throw pattern (which surfaces in any fix touching frontend test infrastructure) is a separate cross-cutting issue tracked under BUG-bun-test-isolate-silently-skips-every-describeorskip-suite (this ticket) as a related but distinct problem.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
