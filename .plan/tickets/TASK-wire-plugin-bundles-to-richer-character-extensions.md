<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Wire plugin bundles to richer character extensions

**Summary:** With richer character fields promoted to canonical (abilities, skills, equipment, vitals, motivations, personality_traits, appearance_details, structured_tags, speech_patterns, conditions, languages, alignment), plugin bundles now have first-class structured data to consume. Currently bundles only see the flat freeform character — no contract for richer fields.
**Context:** Character spec promotion to richer fields (src/characters/spec/character.ts) happened; plugin bundles did not gain per-bundle declarations of which richer fields they require. The fantasy-rpg bundle is the first target.
**Acceptance Criteria:** At least one plugin bundle (fantasy-rpg) explicitly lists required rich extension fields in its manifest. A character with rich fields (abilities/skills/vitals/motivations) injected via that bundle is round-tripped into the LLM prompt. New test asserts the bundle's required fields and validates a sample character. Bundle authoring UX, frontend surfaces, and migration tooling remain separate tickets.

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Why**: With the canonical character spec promoted to include richer fields (abilities/skills/equipment/vitals/motivations/personality_traits/appearance_details/structured_tags/speech_patterns/conditions/languages/alignment), plugin bundles now have first-class structured data to consume. Currently bundles only see the flat freeform character — no contract for richer fields.

**Scope**: For each existing plugin bundle in  (start with the fantasy-rpg bundle), declare which rich extension fields it requires and document the per-bundle validation rules. Wire  (or equivalent) to surface those fields during prompt assembly and LLM tool invocation. Add per-bundle test fixtures covering at least one character with rich fields.

**Acceptance**:
- At least one plugin bundle (fantasy-rpg) explicitly lists required rich extension fields in its manifest.
- A character with rich fields (abilities/skills/vitals/motivations) injected via that bundle is round-tripped into the LLM prompt.
- New test:  (or equivalent) asserts the bundle's required fields and validates a sample character.

**References**:
- Spec:  (Richer Optional Fields block)
- Docs:  §1.2c
- Epic:  (FEAT-007, FEAT-008)

**Branch**: open on dev (post-merge of character-spec-richer-fields).

**Out of scope**: New bundles, bundle authoring UX, frontend surfaces (separate tickets), migration tooling (separate ticket).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
