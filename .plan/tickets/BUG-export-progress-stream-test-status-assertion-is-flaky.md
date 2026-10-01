<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->


# BUG-export-progress-stream-test-status-assertion-is-flaky: Test asserted on terminal status immediately after startExport; hermetic mock required

**Status:** Done
**Priority:** medium
**Effort:** Trivial
**Labels:** bug, frontend, testing
**Epic:** (none)
**Related**: git issue 2b8da26


**Summary:** `src/frontend/alpine/export-progress.stream.test.ts` mocks `globalThis.fetch` to deliver an SSE fixture, but production code (`src/frontend/alpine/export-progress.ts`) calls `apiFetch` from `./htmx` (which delegates to `feFetch` → `safeFetch` → `globalThis.fetch`). When sibling `src/frontend/alpine/export-progress.test.ts` runs in the same `bun test` invocation — even in a different file — its `mock.module("./htmx", …)` shadows the real `./htmx` for the whole process. The stream test then sees `apiFetch` going to the sibling file's default 404 handler; `startExport` resolves with `status === "queued"` (no SSE frame ever applied) and `error === "status.exportStartFailed"`. Running the stream test in isolation passes; running it after the sibling file fails deterministically.

**Context:** Pre-existing on dev (predates EPIC-2026-23 closeout); flagged 2026-09-25 during adversarial review. The original report hypothesised a race between `startExport()` resolving and `applyEvent` for the terminal frame — that hypothesis was wrong; the real failure mode is process-global `mock.module` shadowing.

**Acceptance Criteria:**
- [x] Stream test installs its own `mock.module("./htmx", …)` matching the convention used in `export-progress.test.ts`, so it is hermetic regardless of file ordering under `bun test src/frontend/`.
- [x] Stream test no longer mutates `globalThis.fetch` or `globalThis.localStorage`; those seams were irrelevant to the path under test.
- [x] `bun test src/frontend/alpine/export-progress.stream.test.ts` passes 50/50 runs in isolation.
- [x] `bun test src/frontend/alpine/export-progress.stream.test.ts src/frontend/alpine/export-progress.test.ts` passes (reverse and forward order).
- [x] `bun test src/frontend/alpine/export-progress` (both files) reports 21 pass / 0 fail under the previous flake-amplifying ordering.
- [x] Test still asserts the two regression contracts: (a) SSE body is consumed incrementally (not buffered via `response.text()`) and the stream is cancelled after the terminal frame; (b) stream mode does NOT arm the 30s `safeFetch` timeout (`captured.signal === undefined`).

**Repro evidence** (2026-09-26, worktree `fix-export-progress-flaky-test`):

```bash
# Pre-fix: 100/100 deterministic failures when run alongside export-progress.test.ts
$ for i in $(seq 1 100); do
    bun test src/frontend/alpine/export-progress > .tmp/run.out 2>&1
    grep -q "21 pass" .tmp/run.out || echo "fail on run $i"
  done
# (silent — every run fails; last failure: ctx.status expected "completed", received "queued")

# Post-fix: 100/100 stable
$ for i in $(seq 1 100); do
    bun test src/frontend/alpine/export-progress > .tmp/run.out 2>&1
    grep -q "21 pass" .tmp/run.out && echo "pass $i" || echo "FAIL $i"
  done | wc -l
# 100
```

**Fix direction** (applied):

```typescript
// BEFORE: mock the wrong seam (globalThis.fetch is bypassed when
// export-progress.test.ts's mock.module shadows ./htmx process-wide).
globalThis.fetch = (async (_input, init?) => { captured = init; return stream.response; }) as typeof fetch;

// AFTER: mock the seam production code actually calls (apiFetch), matching
// the established convention in export-progress.test.ts.
let handler: ApiFetchMock = async () => new Response(null, { status: 404, });
mock.module("./htmx", () => ({
  apiFetch: ((url, opts?) => handler(url, opts)) satisfies ApiFetchMock,
}));
const { exportProgressFactory } = await import("./export-progress");
handler = async (_url, init?) => { captured = init; return stream.response; };
```

`await import(...)` is intentional: it must run AFTER `mock.module(...)` so the mocked `./htmx` is what `export-progress.ts` resolves.

**Why this is the right fix, not a polling-wait hack**: a polling `waitFor` would mask the bug by eventually seeing `status === "completed"` — but only if `applyEvent` was going to fire eventually. Under the real failure mode the SSE fixture never reaches `startExport`'s reader at all (because `apiFetch` returns 404), so polling waits forever or until an arbitrary cap elapses, surfacing as "predicate not satisfied" — the symptom that initially looked like a microtask race. The actual root cause is the wrong mock seam; fixing the seam makes the immediate `expect(...)` deterministic and removes the polling crutch.

**Follow-up considerations** (NOT in this fix; defer):

- The other 19 pre-existing frontend test failures (toast-key mismatches in `gif-picker`, `chat-group`, `chat/world`, etc.) are independent bugs and will need their own tickets. Out of scope here.
- A repo-wide convention for mock placement (always mock `./htmx`, never `globalThis.fetch`, for SSE-streaming tests) would be worth documenting; not blocking this fix.
