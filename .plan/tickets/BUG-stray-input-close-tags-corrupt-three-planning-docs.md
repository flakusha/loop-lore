# BUG: stray-input-close-tags-corrupt-three-planning-docs

**Status:** ✅ Done
**Priority:** low
**Effort:** Medium

## Summary

Edit-heredoc artifact from f69d0229's doc pass left literal '</input>' lines in .plan/epics/epic-crypto.md (4 occurrences), .plan/epics/epic-encryption-workflow.md, and .plan/tickets/BUG-encryption-tier-not-enforced.md. The tags are not part of any template convention in the repo (checked other epics/tickets - zero legitimate uses). Fix: delete the stray lines; verify with rg '</input>' .plan/ docs/ returning empty.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: no stray </input> in .plan/docs outside ticket prose.
