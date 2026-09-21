<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Frontend surfaces for richer character extensions

**Summary:** Authoring UI at src/frontend/ only exposes freeform personality/appearance/tags/languages — the richer character extension fields (abilities, skills, equipment, vitals, motivations, personality_traits, appearance_details, structured_tags, speech_patterns, conditions, languages, alignment) promoted in src/characters/spec/character.ts are invisible to users. Authors cannot edit rich fields through the UI.
**Context:** Richer character extension fields were promoted to the canonical character shape but the Alpine.js editor surface at src/frontend/alpine/ did not gain editors for them. Existing patterns in src/frontend/alpine/npc.ts (relationship/inventory editors) are the model to extend.
**Acceptance Criteria:** Character edit page renders an editor section for each richer extension field (abilities record editor with +/- modifier; skills list editor with ability binding; equipment slot-based editor; vitals key/value HP/MP; motivations typed list; structured_tags category + value). Edits to richer fields round-trip via PUT /api/characters/:id. New test exercises one rich-field edit cycle. No regression in existing character editor flows.

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Why**: The richer character extension fields (abilities/skills/equipment/vitals/motivations/personality_traits/appearance_details/structured_tags/speech_patterns/conditions/languages/alignment) are now first-class on the canonical character, but the frontend editor at src/frontend/ only exposes the freeform personality/appearance/tags/languages fields. Authors can't edit rich fields through the UI; rich data is invisible to users.

**Scope**: Add Alpine.js components (or extend existing ones in src/frontend/alpine/) to edit each richer extension field. At minimum: abilities (record editor with +/- modifier), skills (list editor with ability binding), equipment (slot-based editor), vitals (key/value HP/MP), motivations (typed list), structured_tags (category + value). Reuse the existing patterns in npc.ts and chat-types/.

**Acceptance**:
- Character edit page () renders an editor section for each richer extension field.
- Edits to richer fields round-trip via PUT /api/characters/:id.
- New test:  (or equivalent) exercises one rich-field edit cycle.
- No regression in existing character editor flows.

**References**:
- Spec: src/characters/spec/character.ts
- Existing patterns: src/frontend/alpine/npc.ts (npc relationship/inventory editors)
- Epic: .plan/epics/epic-character-core-system.md

**Branch**: open on dev.

**Out of scope**: Bundle-specific UI (separate ticket), backend schema for richer fields (already promoted), migration tooling.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
