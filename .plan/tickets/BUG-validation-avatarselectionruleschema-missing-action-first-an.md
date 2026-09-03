# BUG: validation: AvatarSelectionRuleSchema missing action_first and context_first enum values

**Status:** ✅ Resolved (already on dev, 2026-09-03)
**Priority:** medium
**Effort:** Medium

## Summary

src/validation/db-schemas.ts line 28 AvatarSelectionRuleSchema lists only 5 values; the enum in src/db/enums-character/avatar.ts defines 7 including action_first and context_first (added in 53ce659b). Auto-generated schema was not regenerated, so routes validating avatar config reject the new legit rules. Fix: re-run the db-types generator (bun run db:sync-types) and regenerate db-schemas.

## Resolution

Already fixed in dev. `bun run db:sync-types` was run after the enum expansion (`53ce659b`); the regenerated schema lists all 7 enum values. Verified 2026-09-03 against current `dev` (`60a76152`):

- `src/validation/db-schemas.ts:28-36` — `AvatarSelectionRuleSchema = t.UnionEnum([...])` lists all 7 values: `emotion_first`, `mood_first`, `action_first`, `context_first`, `weighted`, `random`, `fixed`.
- Matches the source-of-truth enum at `src/db/enums-character/avatar.ts` (`AvatarSelectionRule` const object, 7 entries).
- Consumers: `selection_rule_override` at `db-schemas.ts:1166` accepts the new values.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
