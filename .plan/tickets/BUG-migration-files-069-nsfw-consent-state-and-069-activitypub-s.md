# BUG: Migration files 069_nsfw_consent_state and 069_activitypub share numeric prefix

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Two migration files in src/db/migrations/ share prefix 069_: '069_nsfw_consent_state.ts' and '069_activitypub_actor_keys_and_federation_consent.ts'. Migration runner uses localeCompare on filenames for ordering. Both already applied to dev (commits 49731047 and 9b38375d). Practical impact: nil (both create new tables with no shared dependencies; apply in any order). Suggested fix: leave filenames (renaming breaks applied DBs via kysely_migration orphan). Add prefix-uniqueness check to migrate.ts so future duplications are caught.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
