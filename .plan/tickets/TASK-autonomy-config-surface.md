<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Autonomy Config Surface

**Status:** open
**Priority:** high
**Effort:** Medium (layering API + UI affordances + pacing presets)
**Summary:** Provide the layered configuration surface for actor autonomy pacing: world default → chat override → per-actor override, with pacing presets (serene / organic / brisk), an unlimited stress preset gated to dev builds, and UI affordances in chat + world settings pages.
**Context:** Referenced by `epic-actor-autonomy-story-drive.md` Work Item list as `TASK-autonomy-config-surface` (line 72) and Concrete Implementation table row 6 (line 106). Listed as `TBD — needs filing` in the gap-audit (2026-09-23). The autonomy subsystem already has `NpcNavigationService` and the story auto-drive scheduler; this ticket supplies the user-facing config knobs that tune it.

**Acceptance Criteria:**
- [ ] Layered config schema: world-level default → chat-level override → per-actor override, with the precedence rules codified and unit-tested.
- [ ] Preset registry: `serene`, `organic`, `brisk` ship as built-in presets; `unlimited-stress` is gated behind `process.env.NODE_ENV !== 'production'`.
- [ ] Chat settings page exposes the autonomy section with a per-chat override.
- [ ] World settings page exposes the autonomy default + per-actor override editor.
- [ ] The autonomy subsystem reads the layered config at every tick (no caching past the chat-session boundary).
- [ ] Unit tests cover the layering rules and the dev-only gating.
- [ ] `bun run check` green.

**Epic:** epic-actor-autonomy-story-drive
**Tags:** autonomy, config, presets, chat-settings, world-settings, ui, layering
**Related:** TASK-autonomy-rate-governor, TASK-story-auto-drive-scheduler, epic-actor-autonomy-story-drive.md:70-72, epics-index.md (EPIC-RESEARCH-AGENCY-DECISION)


git issue: d08a0f2
