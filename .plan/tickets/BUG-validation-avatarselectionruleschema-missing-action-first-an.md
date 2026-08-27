# BUG: validation: AvatarSelectionRuleSchema missing action_first and context_first enum values

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/validation/db-schemas.ts line 28 AvatarSelectionRuleSchema lists only 5 values; the enum in src/db/enums-character/avatar.ts defines 7 including action_first and context_first (added in 53ce659b). Auto-generated schema was not regenerated, so routes validating avatar config reject the new legit rules. Fix: re-run the db-types generator (bun run db:sync-types) and regenerate db-schemas.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
