<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: spike nsfwrating value object behind pure functions

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-code-quality
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

DDD rec-2 tracer spike (DDDReview): a pure `NsfwRating`-shaped module or a documented ADOPT/DEFER verdict with boundary notes; zero production behavior change.

**Ground state:** Aggregates are anemic rows today — Kysely row types in `src/db/schema*.ts` are the domain objects; behavior lives in procedural services (`src/chat/service/*`, `src/turning/*`, `src/rpg/*`); no `Chat`, `ModerationAction`, `NsfwRating` classes with invariants exist in `src/`. Regression anchor: `check-nsfw-eligibility.test.ts:229-240` (all-tiers case incl. future-tier auto-recognition).

**Adopt/adapt/defer:** ADOPT the doc's own deferral, not the pattern yet — services-first reveals true aggregate boundaries; premature entity classes cement wrong boundaries and churn every caller (same strangler sources as rec 1). DEFER: `NsfwRating` value object, `Chat`/`ModerationAction` encapsulating classes — revisit only after recs 1/3/4 land. This ticket is a spike-tracer, not a rollout; rec 7 is encoded here as an explicit non-goal, not a standalone ticket.

**Acceptance criteria:**

- [ ] Zero production behavior change; a pure `NsfwRating`-shaped module (or documented ADOPT/DEFER verdict with boundary notes) covering the `isNsfwRating` tier set incl. future-tier auto-recognition.
- [ ] Explicit verdict on whether `Chat`/`ModerationAction` classes follow or stay procedural.
- [ ] Closes with a recommendation, not a migration.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
