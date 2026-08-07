# TASK: Migrate Views to Shared Partials + Request Helper

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-frontend-html-dedup-htmx-reuse
**Tags:** frontend, htmx, views, migration

## Summary

Apply the shared partials and the centralized htmx request helper across the live views,
retiring the per-view duplicates after extraction.

## What to Do

1. Swap in shared partials at each audited duplicate (from
   `TASK-html-dedup-shared-partials`).
2. Replace inline `hx-*` request groups with the canonical request helper (from
   `TASK-htmx-ajax-request-helper`).
3. Remove now-empty wrapper markup; keep views thin and delegation-forward.
4. Update any server-render include path / partial registration as needed.

## Acceptance Criteria

- [ ] All audited duplicates reference shared partials
- [ ] Views use the request helper; per-view htmx request groups removed
- [ ] No unused partials left behind; no orphaned includes
- [ ] `bun run check` passes; browser e2e green

## Files

- `src/views/**` — primary migration surface
- `src/components/**`, `src/partials/**` — shared fragments + includes
- `tests/e2e/flows/browser/**` — regression gate

## Related

- `TASK-html-dedup-shared-partials`
- `TASK-htmx-ajax-request-helper`
- `TASK-htmx-reuse-e2e-verify`
