<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: World Simulation Discovery And Trade Events

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-actor-autonomy-story-drive
**Tags:** world, simulation, trade

**Summary:**
World tick emits discovery and trade events between locations: caravans, traders, explorers finding new passages.

**Context:**
Trade routes and exploration should be organic - discovered by simulation, not scripted.

**Acceptance Criteria:**
- On tick, consult each party route and economy; if a trade convoy is in motion, fire `trade:route` event.
- Discovery: NPCs exploring uncharted location increase `discover_progress`; reaches threshold -> emit `location:discovered` event consumed by `epic-world-locations`.
- Events written to `world_events` log; display in admin panel.
- Tests: scheduled caravan fires trade event; exploration decays over time.

<<<<<<< ours — heading `TASK: World Simulation Discovery And Trade Events` (S+F, confidence: low)
// hint: Structural and logic conflict. Both design and behavior differ.
**Resolved:** 2026-10-02 registry-driven close: git issue 42327b4 (registry tip: 8b44bf16c Konstantin Fedotov Auto-closed: appended .md marker marks TASK-WORLD-SIMULATION-DISCOVERY-)
=======
**Resolved:** 2026-10-03 registry-driven close: git issue 42327b4 (registry tip: 8b44bf16c Konstantin Fedotov Auto-closed: appended .md marker marks TASK-WORLD-SIMULATION-DISCOVERY-)
>>>>>>> theirs — heading `TASK: World Simulation Discovery And Trade Events` (S+F, confidence: low)
