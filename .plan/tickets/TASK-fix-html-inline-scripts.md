# TASK: Extract Inline HTML Script Blocks to Frontend TS

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small
**Epic:** epic-continuous-improvement

## Summary

Extract inline `<script>` blocks from HTML templates that exceed the 10-line limit. `lint:html-scripts` gate fails because of 2 oversized blocks.

## Current Failures

```
src/views/layout.html:52 — <script> block is 7L (under limit, informational)
src/views/chat-list.html:82 — <script> block is 17L (exceeds 10L limit)
```

## Execution Plan

1. Read `src/views/chat-list.html` around line 82
2. Extract the 17-line inline script to a new frontend TS file
3. Replace inline block with `<script src="/frontend/chat-list.js"></script>` or similar
4. Update `scripts/build-frontend.sh` if needed to bundle the new file
5. Verify: `bun run lint:html-scripts` passes

## Acceptance Criteria

- [ ] `bun run lint:html-scripts` exits 0
- [ ] `bun run check` lint:html-scripts gate passes
- [ ] Frontend functionality preserved (test manually if possible)

## Files

- `src/views/chat-list.html`
- `src/frontend/` (new file for extracted script)
- `scripts/build-frontend.sh` (if bundling needed)
