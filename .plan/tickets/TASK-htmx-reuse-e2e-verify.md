# TASK: HTMX Reuse E2E Verification

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Low
**Epic:** epic-frontend-html-dedup-htmx-reuse
**Tags:** frontend, htmx, e2e, testing

## Summary

Prove the dedup + htmx-reuse refactor changes markup structure without breaking behavior:
run the browser and unit gates after each migration task.

## What to Do

1. Run the browser e2e suite after `TASK-htmx-migrate-views` lands:
   `for f in tests/e2e/flows/browser/*.browser.ts; do bun test --max-concurrency=1 "./$f" || exit 1; done`
2. Run `bun run check` (typecheck, lint, dprint, unit).
3. Confirm no DOM-structure regressions in `htmx-alpine.browser.ts` + `chat-flow.browser.ts`
   (swap/afterSwap, OOB, Alpine init).
4. Report before/after pass counts.

## Acceptance Criteria

- [x] Full browser e2e suite green after migration — 113 pass / 0 fail across 18 files (2026-08-07)
- [x] `bun run check` passes
- [x] htmx-alpine + chat-flow browser flows unchanged in number of passing assertions
- [x] No new fixed-sleep waits introduced — fixed a broken textContent-based wait in access-correctness (x-show keeps node in DOM); now asserts on computed style
- [x] Browser suite confirmed to run in parallel (true per-process isolation; the shared `bun test f1 f2 …` form clobbers process-global singletons, so per-file invocation is required)

## Files

- `tests/e2e/flows/browser/**` — run + report
- `bun run check` — full gate

## Related

- `TASK-htmx-migrate-views` (gate after), `TASK-htmx-ajax-request-helper`
