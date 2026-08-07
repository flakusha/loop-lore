# TASK: HTMX Reuse E2E Verification

**Status:** ⬜ Not Started
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

- [ ] Full browser e2e suite green after migration
- [ ] `bun run check` passes
- [ ] htmx-alpine + chat-flow browser flows unchanged in number of passing assertions
- [ ] No new fixed-sleep waits introduced

## Files

- `tests/e2e/flows/browser/**` — run + report
- `bun run check` — full gate

## Related

- `TASK-htmx-migrate-views` (gate after), `TASK-htmx-ajax-request-helper`
