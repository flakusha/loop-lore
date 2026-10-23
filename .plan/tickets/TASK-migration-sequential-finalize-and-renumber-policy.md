<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: migration sequential-finalize and renumber policy

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** continuous-improvement
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Enforce a sequential-finalize + renumber-per-landing-order policy for DB
migrations so concurrent worktrees stop colliding on migration numbers.
Source: assistant integration review 2026-10-23 (gap 1 / rec 1) — the
highest-ranked in-flight merge blocker.

**Context:** (verified per-worktree via `git diff dev...HEAD --stat -- src/db/migrations`)

Three-way `071_`/`072_` filename collision:

- char-stat-traits: `071_worlds_stat_requirements`, `072_character_stat_allocation`
- chat-rich-engagement: `071_message_polls`, `072_link_previews`
- xp-progression-surface: `071_worlds_rpg_skills`

All three also edit `src/db/schema-manifest.ts`, `schema.ts`,
`src/validation/db-schemas.ts`. Finalize order determines renumbering;
unrebased branches will fail the `db - schema gate`.

**Approach**

- Finalize xp-progression-surface, char-stat-traits, chat-rich-engagement
  strictly one-at-a-time.
- After each finalize: renumber the remaining branches' `071_/072_` files per
  the new landing order and regenerate generated schema files
  (`bun run db:sync-*`).
- Record the policy in `src/db/migrations/README.md` (append-only policy
  section) so future parallel worktrees expect renumbering before finalize.

**Acceptance Criteria:**

- [ ] Policy documented in `src/db/migrations/README.md`
- [ ] All three branches finalize sequentially with the `db - schema gate` green
- [ ] No duplicate migration numbers on dev afterwards
- [ ] `migration-roundtrip.test.ts` (up→down→up) still green
