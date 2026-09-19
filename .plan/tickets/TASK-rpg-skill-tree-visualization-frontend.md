<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: RPG Skill Tree Visualization Frontend

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** (see ## Summary below)
**Context:** (see ## Summary — same block)
**Acceptance Criteria:** (see ## Acceptance Criteria below)
**Epic:** epic-skills

## Summary

Add FE skill tree visualization on character-edit page. New partial src/views/partials/skill-tree-viewer.html consuming GET /api/rpg/skills/actors/:actorId/tree (already wired in src/routes/rpg/skills-progression.ts). Render prerequisites graph as nested boxes per SkillCategory. Click a node to expand it (htmx swap with detail panel showing skill metadata + addXp button). Alpine.js for state, similar pattern as character-growth-editor.html. No new dependencies — reuse existing htmx + Alpine. Tests: bun:test route tests already exist in src/routes/rpg/skills.test.ts; add minimal view-render smoke test. Epic: epic-skills.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
