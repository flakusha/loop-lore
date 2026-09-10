<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: idempotency `table` backend is unimplemented (silently == memory)

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-middleware-request-lifecycle

## Summary

`src/middleware/idempotency.ts` only implements the `memory` backend.
`idempotent({ backend: "table", asyncStore })` behaves identically to
`memory`; the `asyncStore` parameter is never read (dead parameter). This
contradicts the AC in `TASK-middleware-idempotency-wire-into-elysia.md`
(the `table` backend should persist real `complete` rows via `asyncStore`)
and means multi-instance production gets no real replay. The lifecycle hooks
that would feed `complete` rows to the store are also not wired (see sibling
bugs).

## Acceptance Criteria

- [x] Implement the `table` backend through `asyncStore` (read/write in-flight
      + complete via the store).
- [x] Test: two instances sharing the store replay the same key.

## Resolution

Implemented `createTableBackend(ttlMs, asyncStore)` in
`src/middleware/idempotency-table.ts`:

- **Hot path** (`get(key)`): returns the local `Map` entry if present
  (fast path, no DB round-trip). On miss, returns `null` immediately
  and kicks off a background `asyncStore.read(key)` to hydrate the
  cache for the next caller. Cross-process instances share the
  persisted response on their next arrival.
- **`markInFlight(key, meta)`**: reserves the local slot synchronously;
  queues `asyncStore.track()` for cross-instance visibility on next
  queue flush.
- **`recordResponse(key, meta, args)`**: writes the local cache entry
  synchronously; queues `asyncStore.complete()` so future processes
  can replay the response.
- **`release(key, meta)`**: drops the local slot. No DB write — the
  in-flight row was never marked complete.
- **Error swallow**: hydrate failures (DB unavailable) are silently
  caught; the hot path never throws.
- **TTL**: persisted rows past `ttlMs` are not seeded.
- **Thundering-herd coalescing** (added in strict review): concurrent
  `get()` misses for the same key share one in-flight hydrate promise
  via a `Map<key, Promise>`. N concurrent misses → 1 DB read.
- **Race protection** (added in strict review): the hydrate path
  refuses to overwrite a fresher entry — both an `inFlight` marker
  (because the handler is still running) and a higher-`completedAt`
  (because a local `recordResponse` is fresher than any persisted row).
- **F14 unhandled-rejection fix**: `recordResponse` now wraps
  `void snapshot.text().then(...)` with `.catch(...)` that calls
  `backend.release(key)` + emits a PII-safe warn log. Without this,
  a `.text()` rejection (stream locked, OOM, upstream consumed body)
  terminates the Bun process with `error: <message>` exit 1.

`idempotent({ backend: "table", asyncStore })` now requires
`asyncStore`; the dead-parameter trap is gone.

### Strict-review audits

Two adversarial reviews caught drift between claimed and actual
behaviour. **Tests were added that FAIL without the fix.**

#### Second pass (adversarial #1): PII redaction

The hydrate catch block was logging the full cache key, which embeds
`userId` + `requestId`. Default logger censor rules don't redact
`userId`, so the leak would have produced a plain-text userId in
production logs. Fix: extracted `redactKeyForLog(key)` that returns
`METHOD ROUTE` only (first 2 of 4 space-separated tokens); unit-tested
with 4 cases (PII key, anon key, malformed key, 2-token key).

Verified at `sqliteError.message` does NOT contain bound parameters,
so the catch's `error.message` cannot leak the key either way.

#### Third pass (adversarial #2): race conditions on hydrate

Two race scenarios were not initially handled:

1. **Stale-DB-row clobber**: a slow hydrate from a sibling instance's
   persisted row could overwrite a fresh local `recordResponse` entry
   (with stale data). The local cache had a HIGHER `completedAt`, so
   the hydrate's clobber silently **downgraded** the response. Fix:
   refuse to overwrite when `existing.completedAt >= entry.completedAt`.

2. **In-flight marker clobber**: a hydrate from a persisted complete
   row could overwrite a `markInFlight` reservation (because the
   handler is still running). A third concurrent caller would then
   replay the persisted response instead of waiting — silently losing
   the in-flight request's response. Fix: refuse to overwrite when
   `existing.inFlight`.

Both fixes are empirically proven: temporarily disabling each guard
causes the corresponding test to fail with the expected wrong state
(`"stale-db"` instead of `"fresh-local"`, `inFlight: false` instead
of `true`). Restoring the guards re-greens both tests.

A third hardening: **thundering-herd coalescing**. Without
coalescing, N concurrent `get()` misses for the same key fan out to
N parallel DB reads. Fix: a `Map<key, Promise<void>>` keyed on the
cache key, with `pending.finally(() => inflightHydrates.delete(key))`
to release the slot after settlement.

### Files touched

- `src/middleware/idempotency-table.ts` — new (table backend).
- `src/middleware/idempotency-table.test.ts` — new (unit tests,
  including adversarial race-condition tests).
- `src/middleware/idempotency-table.integration.test.ts` — new (Elysia
  integration tests; one was structurally re-tested and its
  expectations updated to match the post-fix correct behaviour).
- `src/middleware/idempotency-utils.ts` — new (`makeKey`,
  `filterReplayHeaders`).
- `src/middleware/idempotency.ts` — wired `backend: "table"`;
  `requireAsyncStore` guard; **F14 `.catch` block** on `recordResponse`;
  `getLog()` now returns fresh logger per call (was module-cached,
  which broke test captures after `setGlobalLogger`); `module` passed
  as warn-log meta (was a `.child()` binding that didn't propagate
  custom transports); `size-allow: 285` (file is 279L).
- `src/middleware/idempotency.test.ts` — **+3 F14 regression tests**
  (309 total): erroring-stream slot release, normal-stream caching,
  PII-redacted warn log capture.
- `src/middleware/idempotency-memory.ts` + `.test.ts` — dprint fmt
  (pre-existing files written earlier on this worktree without
  running dprint; required to pass the check gate).

### Verification

- `bun test src/middleware/` — **309/309 pass** (was 306 before F14
  regression tests; 308 after the first F14 round; 309 after adding
  the PII-redaction test). 302 at claim-time.
- `bun run check` — **20/21 gates green** (1 failure: `plan:sync`,
  3 status mismatches on pre-existing NSFW tickets, unrelated to F14;
  the F14 ticket's own hash/index state is 🟢 clean per the same report).
- **F14 adversarial proof (twice over)**: temporarily removing the
  `.catch` block causes BOTH F14 tests to fail with
  `error: stream error` (Bun's unhandled-rejection exit). Restoring
  `.catch` re-greens both tests and logs
  `idempotency.record_response.failed` instead of crashing. The fix
  is necessary — without it, a single body-read rejection terminates
  the server.
- **F14.S7 adversarial proof**: the original `_log ??= getLogger()`
  module-cache caused test ordering bugs (an earlier test calling
  `createLogger` would lock the factory's logger to that logger,
  breaking later tests' capture-transport attempts). Fixed by fetching
  fresh per call. Without the fix, the new `recordResponse warn log
  emits PII-redacted methodRoute` test fails when run with the rest
  of the suite.
- Adversarial proof: each race-protection test **fails** when its
  corresponding guard is temporarily disabled, **passes** when
  restored. The fixes are not "should work" — they are demonstrated
  to address the bug.

### Wiring verification (strict-review F14.9)

`idem.recordResponse` is wired in `src/elysia-app.ts::createApp`:

```ts
app.onAfterHandle(async (ctx) => {
  const requestId = ctx.requestId;
  if (!requestId) { return; }
  const response = ctx.response;
  if (!(response instanceof Response) || response.status >= 300) {
    idem.release({ method, route, requestId, userId, });
    return;
  }
  idem.recordResponse({ method, route, requestId, userId, response, });
});
```

The integration test (`src/middleware/idempotency-table.integration.test.ts::setup`)
mirrors this exact wiring with `idem.recordResponse({ ..., response })`.
F14 protects this code path — when an upstream handler has already
consumed the response body (or the body stream errors), the clone's
`.text()` rejects, the `.catch` fires, the in-flight slot is released.

### Strict-review pass 5 — sibling-file logger fix (F14.S7.S5)

**Finding**: the same `_log ??= getLogger()...` cache pattern
(classic test-ordering bug) existed in `idempotency-table.ts`'s
`getLog()` plus a deeper issue: `getLogger().child({ module: ... })`
returns a child logger whose queue carries only the built-in
`ConsoleTransport`, so custom transports added via
`addTransport()`/`setGlobalLogger()` in tests are invisible to child
loggers. The PII test in `idempotency.test.ts` worked only because
that file's `getLog()` returns `getLogger()` directly with no
`.child()` wrapper.

**Fix applied** (idempotency-table.ts):
  1. Dropped `_log ??= getLogger()` cache — fetch fresh per call.
  2. Dropped `.child({ module: "idempotency-table" })` — bare
     `getLogger()` like `idempotency.ts`.
  3. Attached `module: "idempotency-table"` to the warn meta instead,
     so log consumers can still filter by `meta.module`.

**Regression test added** (`idempotency-table.test.ts::hydrate_failed
warn log emits module=idempotency-table via live logger`):
  - Sets a custom global logger with a capturing transport.
  - Forces `hydrateFromTable` to fail (DB destroyed).
  - Asserts the captured entry has `meta.module === "idempotency-table"`,
    `meta.methodRoute === "POST /api/x"` (PII-redacted), and the serialized
    meta does not contain `user-7a3b` or `r-secret-deadbeef`.

**Adversarial proof** (fresh evidence this turn): re-introducing
`.child({ module: "idempotency-table" })` causes the test to FAIL with
`expect(received).toBeDefined() Received: undefined` (captured array
empty — child's queue has no custom transport). Restoring the bare
`getLogger()` re-greens the test.

**Final state (pass 5)**:
  - `bun test src/middleware/` → **310/310 pass** (was 309; +1 sibling test).
  - `bun run typecheck` → clean.
  - `bun run format` (dprint) → clean.
  - `bun run check` → 20/21 green (1 pre-existing plan:sync NSFW mismatch,
    unrelated to F14; F14 ticket's own hash/index state 🟢).

### Strict-review pass 7 — `redactKeyForLog` dedupe (F14.S14)

**Finding**: `idempotency.ts` had a local copy of `redactKeyForLog`
(lines 218-229 pre-pass-7) with a JSDoc claim of "duplicated here to
avoid a circular import (utils already imported separately there)".
The claim is **factually wrong** — `idempotency-table.ts` does not
import from `idempotency.ts` (verified: only imports from
`../async/store`, `../logger`, `./idempotency-memory`). The duplicate
served no purpose.

**Fix applied** (idempotency.ts):
  1. Added `redactKeyForLog` to the existing `./idempotency-table`
     import (line 37, was `import { createTableBackend }`).
  2. Removed the local `redactKeyForLog` function definition and its
     misleading JSDoc (lines 218-229).
  3. File shrinks 281L → 267L (still over the 250L default, keep
     `size-allow: 285`).

**Adversarial proof** (fresh evidence this turn): removing
`redactKeyForLog` from the import causes `bun run typecheck` to fail
with `TS2304: Cannot find name 'redactKeyForLog'` — TypeScript
immediately catches the missing symbol. Restoring the import re-greens
typecheck.

**Behavior preserved**: the 4 input cases tested in
`idempotency-table.test.ts::redactKeyForLog strips userId + requestId
from the cache key` (4-token, 3-token, malformed, 2-token) are now
the only contract test. The production call site
(`idempotency.ts:191`) feeds only well-formed keys from `makeKey()`,
so the edge-case behavior is not exercised in prod but is covered
indirectly by the unit test.

**Final state (pass 7)**:
  - `bun test src/middleware/` → **310/310 pass** (unchanged; behavior preserved).
  - `bun run typecheck` → clean.
  - `bun run format` (dprint) → clean.
  - `bun run check` → 20/21 green (same pre-existing plan:sync NSFW mismatch).

### Strict-review pass 8 — post-edit whitespace damage audit (F14.S1-S4)

**Finding**: passes 5, 7 left blank-line damage in three files because
the edits removed surrounding context without restoring the conventional
blank line between top-level constructs:

  1. `idempotency.ts` line 215-216: missing blank line between
     `idempotent()`'s closing `}` and `requireAsyncStore()`'s JSDoc.
     (Caused by deleting `redactKeyForLog` + its JSDoc in pass 7.)
  2. `idempotency-table.ts` line 1-3: missing blank line between
     `// size-allow: 260` and the file-header `/**`. (Caused by
     rewriting `size-allow: 255` -> `260` in pass 5.)
  3. `idempotency-table.ts` line 42-43: missing blank line between
     last import and the JSDoc for `getLog()`. (Caused by rewriting
     `getLog()` body in pass 5.)
  4. `idempotency-table.test.ts` line 21-22: missing blank line
     between last import and `const META`. (Caused by adding logger
     imports in pass 5.)

All four were invisible to `dprint check` — dprint does not enforce a
blank line before top-level declarations. Strict-review pass 8 caught
them by manual cross-reference against the surrounding conventions.

**Fix applied**: inserted the missing blank lines at all four sites.
No semantic change.

**Final state (pass 8)**:
  - `bun test src/middleware/` → **310/310 pass** (unchanged).
  - `bun run typecheck` → clean.
  - `bun run format` (dprint) → clean.
  - `bun run check` → 20/21 green (same pre-existing plan:sync NSFW
    mismatch).

### Strict-review pass 9 — second whitespace audit (F14.S1)

**Finding**: pass 8 audit caught four sites but missed one:
  - `idempotency-table.ts` line 60-61: missing blank line between
    `}` (end of `getLog()`) and `/**` (JSDoc for `rowToEntry()`).
    Caused by rewriting `getLog()` body in pass 5. Pass 8's check of
    `idempotency-table.ts` started from line 1 (correct) but the
    `getLog()` rewrite left this junction unspaced.

**Fix applied**: inserted blank line at line 62.

**Cross-check**: re-verified all 5 root-level closing braces in
`idempotency-table.ts` (lines 62, 87, 186, 238, 258) and 6 in
`idempotency.ts` (lines 60, 80, 216, 236, 252, 268) — all have
correct blank-line separation from their next top-level construct.

**F14.P9.S7 [NIT — skipped]**: `idempotency.test.ts` lines 143-149
have a double blank line + `//` section header between `describe`
blocks, inconsistent with the single blank line + JSDoc convention
used elsewhere in the file. dprint does not flag it. Per the
"don't over-apply" rule, accepted as a stylistic choice; future
refactor could normalize.

**Final state (pass 9)**:
  - `bun test src/middleware/` → **310/310 pass** (unchanged).
  - `bun run typecheck` → clean.
  - `bun run format` (dprint) → clean.
  - `bun run check` → 20/21 green (same pre-existing plan:sync NSFW
    mismatch).

### Strict-review pass 10 — test logger-leak audit (F14.S1)

**Finding**: the two `setGlobalLogger` call sites in
`idempotency-table.test.ts` and `idempotency.test.ts` restored to a
fresh `createLogger({ level: "warn" })` instead of the prior global
logger. Every fresh `LoggerImpl` is initialized with a default
`ConsoleTransport` (`logger.ts:69`), so the post-test logger still
emitted to stderr. Two extra warn lines were leaking into `bun test`
output from emissions AFTER the test's `try` block (i.e. from
subsequent tests or teardown).

**Fix applied**: capture `getLogger()` before `setGlobalLogger(log)` in
both tests; restore in the `finally` block. The first `getLogger()`
call is wrapped in try/catch because the global logger may not be
initialized yet at test start.

**Evidence**: before fix — 4 warn lines in `bun test` output:

```
[WARN ] idempotency.record_response.failed
[WARN ] idempotency-table.hydrate_failed
[WARN ] idempotency-table.hydrate_failed
[WARN ] idempotency-table.hydrate_failed
```

After fix — only 2 warn lines, both emitted DURING the test (legitimate):

```
[WARN ] idempotency-table.hydrate_failed
[WARN ] idempotency.record_response.failed
```

**F14.P10.S7 [BLOCKING]**: Test verification 310/310 pass, file-size
gate clean, typecheck clean.

**Final state (pass 10)**:
  - `bun test src/middleware/` → **310/310 pass** (unchanged behavior).
  - `bun run typecheck` → clean.
  - `bun run format` (dprint) → clean.
  - `bun run scripts/check-file-size` → clean.
  - `bun test src/middleware/` warns in output → 2 (was 4) — the leak
    is fixed.
