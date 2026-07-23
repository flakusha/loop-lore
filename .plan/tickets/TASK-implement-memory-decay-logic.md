# TASK: Implement memory decay logic

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-crafting-professions

## Summary

decay_rate, strength, last_accessed_at columns exist but no logic uses them. Implement time-based decay: strength -= decay_rate × elapsed_days, clamped to [0,1]. Extend src/memory/purge.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
