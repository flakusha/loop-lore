<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publication Translation Batch Pass (Cron)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-publication-i18n
**Related:** `TASK-unit-translation-service.md`, `TASK-publication-unit-translation-store.md`, `TASK-publication-glossary-term-base.md`, `epic-cron-scheduler.md`

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The batch pass: a scheduled job that walks a publication's units in `position`
order and translates every unit that lacks a current translation in the target
locale, skipping what is already done, and resuming cleanly after an
interruption.

## Context

The scheduler already exists and is the only place a periodic pass belongs:
`src/cron/types.ts` defines `CronJobDef` (`:18-29`) with a stable dotted `name`
(`config.cron.jobs[name].enabled` overrides it), a 5-field or nickname
schedule, `unref` defaulted true by `defineJob` in `src/cron/registry.ts:36-38`,
and a `run(ctx: JobContext)` unit of work where a throw is recorded and the job
reschedules. `src/cron/jobs.ts` is the catalog this job registers into;
`src/cron/boot.ts` starts it. Register `publications.translate` (or the next
free dotted name) there — no new scheduler, no `setInterval`.

Selection is the whole design. Per sweep, the job picks units that are:

1. in a publication whose owner requested translations into the target locale
   (the per-publication request lives on the publication — one column, set from
   the owner's action, not a config file);
2. lacking a `(unit, locale)` row that is `complete` **and** fresh (source hash
   matches), which covers both never-translated and edited-since
   (`status = stale`) units in one predicate;
3. not pinned out of the sweep via the existing `PinnedState` on the unit
   (`src/db/enums-core/flags.ts:8`, the same pin the regeneration sweeps in
   `TASK-book-unit-editor-review-surface.md` respect — a unit the author pinned
   is a unit the author does not want touched);
4. in `position` order, so a partially translated book reads coherently while a
   long sweep is still running.

Resumability is a consequence of the predicate, not extra machinery: the job is
stateless and re-derives its work list from the store each run. An interrupted
sweep leaves some units translated and the rest pending; the next run picks up
exactly the pending set. There is no cursor, no checkpoint column, no progress
table. `ponytail:` one unit per transaction keeps a crash cheap; upgrade path is
batching N units per transaction if per-call overhead shows up in production.

Each unit goes through `TASK-unit-translation-service.md`; a `rejected` result
(guard failure) is left in the store for the owner to inspect and is simply
re-attempted on the next sweep once the glossary is fixed. The job never
retries inside a single run — a failing unit is not allowed to stall the sweep.

## Acceptance Criteria

- [ ] A `CronJobDef` is registered in `src/cron/jobs.ts` via `defineJob` with a
      default-disabled-off or sensible default schedule, honoring
      `config.cron.jobs[name].enabled`; no new scheduler mechanism is added
- [ ] The sweep selects exactly the units matching the four rules above — a unit
      test with a seeded fixture asserts the work list contains never-translated
      and stale units and contains no complete-fresh and no pinned units
- [ ] Units are processed in `position` order (test asserts selection order)
- [ ] A mid-sweep failure (provider throw on unit 3 of 5) leaves units 1–2
      translated and the job records the error without killing the process;
      the next sweep re-derives units 3–5
- [ ] A guard-rejected unit does not stop the sweep and remains visible to the
      owner as `rejected`
- [ ] The job is disabled by default and flip-able via
      `config.cron.jobs.<name>.enabled` without a code change
- [ ] `bun test src/cron/registry.test.ts` and `src/cron/jobs.test.ts` still pass
      (the new job must not break existing schedule assertions)
