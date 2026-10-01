<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: docs remove deleted scenario catalog tooling references

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-code-quality.md
**Tags:** cleanup

**Summary:** a190741b8 deleted scripts/check-scenario-catalog.ts and scripts/gen-scenario-catalog.ts (sc:* commands) but docs/giwt-scripts-map.md:17 still documents them. Dead docs. Fix: drop the stale doc lines. Verify: grep -rn scenario-catalog docs/ returns nothing.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Verification command from ticket executed green
