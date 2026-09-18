# BUG: migration: activitypub_actor_keys FK missing onDelete cascade

**Status:** ✅ Closed — fixed in worktree find-work-batch-tickets (verified 2026-09-18)

## Resolution

**Migration path correction**: the original ticket referenced
`src/db/migrations/069_activitypub_actor_keys_and_federation_consent.ts`,
but that migration has since been folded into the `parts/` tree under
`src/db/migrations/parts/004_actors.ts:24` (the project's append-only
migration policy forbids renumbering a shipped migration; the parts
split was a subsequent restructure). The bug applies unchanged: the
FK still lacks `onDelete("cascade")`.

**Fix**: `src/db/migrations/parts/004_actors.ts` — added the missing
`(cb) => cb.onDelete("cascade",)` callback to the
`addForeignKeyConstraint("fk_ap_actor_keys_actor", …)` call (line 28).

**Regression test**: new describe block
`activitypub_actor_keys FK cascades on actor delete` in
`src/db/migrations.test.ts` — inserts a user → actor → key chain,
deletes the actor, asserts the key row vanishes (which would have
thrown FOREIGN KEY constraint failed pre-fix).

**Verification**: `bun test src/db/migrations.test.ts -t FK cascade`
1/1 pass; full migrations suite 50/50 pass; `bun run typecheck` green.
**Schema regeneration**: not needed — `onDelete` is a constraint
attribute, not a column change; `bun run db:sync-types` produced no
diff.
**Priority:** medium
**Effort:** Medium

## Summary

src/db/migrations/069_activitypub_actor_keys_and_federation_consent.ts line 33 addForeignKeyConstraint lacks onDelete("cascade"). Every other FK in the codebase uses onDelete("cascade"); deleting an actor that has federation signing keys will fail with a FK constraint violation. Fix: add onDelete("cascade") to the constraint.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
