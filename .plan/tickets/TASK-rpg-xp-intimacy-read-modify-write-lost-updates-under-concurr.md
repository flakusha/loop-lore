# TASK: RPG XP/intimacy read-modify-write lost updates under concurrency

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/rpg/seduction/service/skills.ts:85 and src/rpg/skills/service/progression.ts:30 compute newXp = skill.xp + amount then set, with no transaction or FOR UPDATE; concurrent awardXp/addXp lose updates (10+5+5 becomes 15). src/rpg/intimacy/service/actions.ts:105 same for pair.score. Fix: SQL-side delta UPDATE ... SET xp=xp+amount WHERE id, or transactional read-with-lock + retry-on-conflict. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
