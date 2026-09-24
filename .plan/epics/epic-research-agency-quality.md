<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC-RESEARCH-AGENCY-QUALITY: Player Agency Quality Telemetry & Coordination

**Status:** Draft
**Priority:** Medium
**Effort:** Medium
**Type:** Research epic (drives implementation tickets)
**Source:** `docs/research/interaction-systems-agency.md` section 3
**Related:** `epic-agency-story-points.md`, `epic-actor-autonomy-story-drive.md`, `epic-actor-turn-skip.md` (`TurnSkip` contract), `epic-analytics-observability.md`, `src/db/schema-moderation.ts` (`interaction_logs`)

## Summary

Make player agency **measurable** so designers can tune consequential asymmetry, not just count options. Three pieces:

1. **`agency_mode` column** on `interaction_log`: `free | forced | blocked | skipped`. Coordinates with `epic-actor-turn-skip.md`'s `TurnSkip` contract; **no duplication**.
2. **Per-dimension counters** (Murray × agency-play × DiGRA): spatial, temporal, manipulation, social, narrative, ludic. Count **meaningful choices** (per Cairns et al.) not raw option counts.
3. **Autonomy <-> agency coordination rule** (DiGRA 2025): the autonomy scheduler must defer one tick when a player message is in flight on the same scene, to prevent autonomous NPCs from foreclosing player choices.

## Acceptance Criteria

- [ ] `interaction_log.agency_mode` column with text-enum default `'free'`; migration rolls forward + back; existing tests pass.
- [ ] Skip path writes `agency_mode = 'skipped'`; hard-block path writes `'blocked'`; forced-choice scenes mark `'forced'`. (Coordinate with `epic-actor-turn-skip.md` task force.)
- [ ] Admin telemetry dashboard surfaces Murray × agency-play dimension counters.
- [ ] Autonomy scheduler gates each tick on `pending_player_intent` for the active scene; deferred actions are queued, not lost.

## Work Items (Lazy Ladder)

1. **`TASK-agency-quality-metrics`** — `agency_mode` column + per-dimension counters + admin surface. P1. 1-2 days.
2. **`TASK-agency-coordination-priority`** — autonomy scheduler defers one tick on pending player intent. P1. 1 day.

## Out of Scope

- Player-facing agency score UI (admin-only first; surface to players only after designers validate the metric).
- Free-form "agency sentiment" NLP over chat text (per-message Murray evaluation is over-budget; counters are sufficient).
- Replacing `TurnSkip` from `epic-actor-turn-skip.md` (coordinate via shared contract, not parallel implementation).
