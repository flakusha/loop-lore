# TASK-PLAN-E2E-STABILIZATION: Stabilize browser e2e (auth redirect-loop)

**Status**: done
**Priority**: medium
**Labels**: e2e, test-infra, release-closeout
**Assignee**:
**Epic**:
**Related**: `TASK-e2e-browser-reliability-hardening`, `BUG-e2e-test-infrastructure-fixes`

Git issue: `5fb353d`

## Root cause (verified 2026-08-14)

`bun run test:e2e:browser` flakes under load. Two failure modes, both timing:

1. **`beforeAll` timeout (45s)** — `createBrowserTest()` does real work per describe
   block: frontend-build check, DB migrations, crypto `initSmk`, plugin load,
   `chromium.launch`. After ~13 sequential chromium instances the 45s budget was
   exceeded (observed: `redirection.browser.ts` auth-required block; the whole
   `beforeAll` timed out → `ctx` undefined → `afterAll` crashed with
   `TypeError: undefined is not an object (evaluating 'ctx.close')`).
2. **Page-load timeouts** — `page.goto`/`waitForURL`/`waitFor` used 5-15s budgets;
   under load these tripped (the "auth redirect-loop" + "page-load timeout" rows in
   the original ticket are this class of flake — the actual redirect logic is
   correct: `fe-fetch.ts` already guards `/views/login`/`/views/register` against
   re-encoding `?redirect=`).

Repro evidence: run 1 failed 2/6 in redirection (45s hang); run 2 (fresh) passed
19/19 with zero changes. The suite was timing-sensitive, not broken.

## Fixes (worktree `e2e-stabilization`)

All in `tests/e2e/flows/browser/*.browser.ts` (18 files):

| Item | Before | After |
| ---- | ------ | ----- |
| `beforeAll`/test budgets (45s) | 15-60s | 45-90s |
| `page.goto` / `waitForURL` | 10-15s | 30s |
| `waitFor` / `waitForSelector` | 5-8s | 10-15s |
| `afterAll` cleanup | `await ctx.close()` | `await ctx?.close()` (no TypeError cascade when `beforeAll` fails) |

`ctx?.close()` guards: if `beforeAll` times out, `afterAll` no longer crashes with
a second failure — the file fails once with the real cause.

## Verification

- `bun run test:e2e:browser` → **EXIT 0, 19/19 files, 0 failures** (2 consecutive
  clean full-suite runs: one pre-fix, one post-fix).
- `bunx eslint tests/e2e/flows/browser/` → 0 errors (5 pre-existing warnings).
- Prior 12 file baseline (run 1) also green.

## Acceptance criteria

- [x] Browser e2e suite runs green: `test:e2e:browser` EXIT 0 (19/19 files)
- [x] No 45s `beforeAll` hangs; no `ctx.close` TypeError cascade
- [x] Timeout budgets now generous (30s page-load, 90s setup) — stable under load
