# TASK: Skills Frontend (Skill Tree & Progression UI)

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Medium
**Epic:** epic-skills-professions-config
**Tags:** skills, frontend, ui, character, tree, progression

## Summary

No frontend exists for skills. Characters have skills (after seeding) but there's no UI to view the skill tree, see progression, or manage specializations. This task builds the skill tree display in the character panel.

## Current State

- `SkillsService.buildSkillTree()` returns `SkillTreeNode[]` with hierarchy
- `rpg-stats.ts` Alpine component shows stats (STR/DEX/etc.) but no skills
- Character info panel has no skill section

## Work

1. **Skill tree component** — `src/frontend/alpine/skill-tree.ts`:
   - Hierarchical display of actor's skills (category → skill → specializations)
   - Show: name, level, proficiency, XP progress bar, locked/unlocked state
   - Expand/collapse categories
   - Click skill → show details (description, prerequisites, bonuses)
2. **Skill detail panel** — in character panel:
   - Selected skill: full info, current level, XP to next level
   - "Add XP" button (for testing/GM) → calls `POST /api/rpg/skills/:id/xp`
   - "Specialize" button → opens specialization selector
   - Prerequisites list (met/missing with links)
3. **Skill progression feedback**:
   - Level-up animation/notification when XP gain triggers level change
   - Proficiency change badge (Novice → Apprentice → ... → Grandmaster)
4. **Character panel integration** — add "Skills" tab/section:
   - Summary: total skills, highest level, specializations count
   - Quick view: top skills by level with proficiency badges

## Acceptance Criteria

- [ ] Skill tree displayed in character panel with hierarchy
- [ ] Each skill shows: name, level, proficiency, XP progress
- [ ] Locked skills visually distinct with prerequisite info
- [ ] Skill detail panel with full info + actions
- [ ] XP gain triggers visual level-up feedback
- [ ] Specialization selector for eligible skills
- [ ] Mobile responsive (collapsible tree)
- [ ] `bun test src/frontend` green; `bun run check` green

## Files to Create

- `src/frontend/alpine/skill-tree.ts` — skill tree Alpine mixin
- `src/components/character/skill-tree-panel.html` — tree panel template
- `src/components/character/skill-detail.html` — skill detail partial

## Files to Modify

- `src/views/characters.html` — add skills tab/section
- `src/components/chat/character-info-panel.html` — add skill summary

## Related

- `TASK-skills-routes.md` — consumes these endpoints
- `TASK-character-config-skills-professions.md` — seeds skills to display
- `TASK-professions-frontend.md` — parallel: profession UI
- `TASK-equipment-stat-preview.md` — skills may affect stats (synergies)
