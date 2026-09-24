<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-agency-quality-metrics: agency_mode column + Murray/agency-play dimension counters

**Status:** Draft
**Priority:** P1 (within EPIC-RESEARCH-AGENCY-QUALITY)
**Effort:** 1-2 days
**Parent epic:** `epic-research-agency-quality.md`
**Related:** `epic-actor-turn-skip.md` (`TurnSkip {actor, beat, mode}` contract - **coordinate, do not duplicate**), `src/db/schema-moderation.ts` (`interaction_logs`), `epic-analytics-observability.md`

## Goal

Make player agency **measurable**. Add `agency_mode` column to `interaction_log` and per-dimension counters (Murray x agency-play x DiGRA) so designers can tune consequential asymmetry, not just count options.

## Why

- Murray (1997): agency requires possible + effective + perceived - all three must be tracked.
- Cairns et al. (2021): count of choices is not the metric; **meanings ascribed** to choices matter. Forcing binary cliffhangers under-counts; free-form over-counts.
- DiGRA (2025): forced-choice scenes need explicit metadata to be honest about agency.
- `epic-actor-turn-skip.md` already proposes `TurnSkip.mode: hold|advance` - coordinate, do not duplicate.

## Acceptance Criteria

- [ ] Migration: `interaction_logs.agency_mode` text-enum, default `'free'`; existing rows backfilled to `'free'`.
- [ ] Skip path writes `agency_mode = 'skipped'` (via `TurnSkip` integration).
- [ ] Hard-block gate writes `agency_mode = 'blocked'` (via `epic-immersion-consistency-gate` integration).
- [ ] Forced-choice scenes (scene-level metadata) write `agency_mode = 'forced'` for every option the player takes.
- [ ] Admin telemetry: per-dimension counters for spatial / temporal / manipulation / social / narrative / ludic choices (counted as **meaningful** choices, not raw options).
- [ ] Roll-forward + roll-back migration tested.

## Out of Scope

- Player-facing agency score UI.
- Free-form "agency sentiment" NLP over chat text.
- Replacing `TurnSkip` (coordinate via shared contract).
