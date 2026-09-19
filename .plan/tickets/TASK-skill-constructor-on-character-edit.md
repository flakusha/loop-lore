<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Skill Constructor On Character Edit

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** (see ## Summary below)
**Context:** (see ## Summary — same block)
**Acceptance Criteria:** (see ## Acceptance Criteria below)
**Epic:** epic-skills

## Summary

Add per-skill create/edit form on character-edit page. Reuse existing POST/PUT/DELETE /api/rpg/skills (src/routes/rpg/skills.ts). New partial src/views/partials/skill-editor.html: form fields for name, category (SkillCategory dropdown), description, prerequisites (multi-select from actor's existing skills), metadata JSON. Add button at the top of the skill tree viewer (TASK-rpg-skill-tree-visualization-frontend). Submit via htmx. Tests: existing in src/routes/rpg/skills.test.ts; add minimal view smoke test. Epic: epic-skills.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
