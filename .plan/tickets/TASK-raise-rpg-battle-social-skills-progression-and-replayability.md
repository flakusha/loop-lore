<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Raise rpg battle-social, skills-progression and replayability-playthrough coverage to the 80 percent floor

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-replayability

**Summary:**

The diff-scoped coverage gate (diff-files mode) floors each diff-touched src file individually at 80 percent. The jsdoc-throws-gaps sweep added required @throws doc lines to src/rpg/service/battles/social.ts (57.7 measured), src/rpg/skills/service/progression.ts (67.6 measured) and src/rpg/replayability/service/playthrough.ts (61.2 measured), exposing pre-existing below-floor unit coverage in those modules. Per-file coverage waivers (scripts/check/coverage/waivers.mjs) were added at conservative floors so the doc sweep can land; this ticket owns closing the real gap: unit suites for the battle-social interaction branches, skills progression curve paths and the replayability playthrough state machine. Remove the three waiver entries when measured coverage reaches 80 percent.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Coverage evidence (waivers deleted 2026-10-23)

All three per-file waivers were deleted from `scripts/check/coverage/waivers.mjs`.
Measured on dev (branch `cov-waiver-salvage`), each file in its top-level
module scope (src/rpg — every test under the top-level module). Floor that
applies after deletion: 80 (no `rpg` module waiver).

- src/rpg/service/battles/social.ts — LF=122, LH=122 -> 100.0% — PASS
- src/rpg/skills/service/progression.ts — LF=135, LH=134 -> 99.3% — PASS
- src/rpg/replayability/service/playthrough.ts — LF=132, LH=132 -> 100.0% — PASS
