# TASK: Fix dangling vitepress sidebar links

**Status:** ✅ Done
**Priority:** high
**Effort:** Low
**Epic:** epic-docs-reconciliation.md

## Summary

Audit every vitepress nav/sidebar target in `docs/.vitepress/config.mts` for
dead links and fix them.

## Acceptance Criteria

- [x] Audit extracted all 60 nav/sidebar links and checked existence
- [x] `/spec/character-setup` → fixed to `/spec/character-spec` (the real file)
- [x] `/spec/tui` → fixed to `/spec/terminal-ui` (the real file)
- [x] All other sidebar targets verified to resolve (58/60 existed)

## Notes

The 2 dead links were the only failures. `ideas/` resolves via `index.md`.
Audit method: extract `link:` values from config.mts and stat each `.md`.