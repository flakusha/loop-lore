<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: personas convertToCharacter: drops title, temperature, max_tokens, model from persona

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

## Observed
PersonasService.convertToCharacter (service.ts:216-234) inserts an actor row carrying only name, avatar_asset_id, and description from the persona. The persona's `title`, `temperature`, `max_tokens`, and `model` columns are NOT carried forward, and no defaults are set. After conversion, the resulting character has no tuning data and the title (a user-visible field) is silently lost.

## Expected
Either (a) carry the persona fields to their natural actor destinations: model → a settings JSON entry, temperature/max_tokens → settings JSON or dedicated columns, title → a creator_notes/description prefix, OR (b) document explicitly that conversion is intentionally a slim subset. The title field in particular is user-facing and should not silently vanish.

## Evidence
- src/personas/service.ts:216-234 — insertInto('actors').values({...}) only maps name/avatar_asset_id/description from persona.
- src/db/schema-core.ts:856-870 — personas table has title, temperature, max_tokens, model columns.
- reproduction: create a persona with title='Dr.', temperature=0.7, max_tokens=2000, model='custom-model'. Convert to character. The resulting actor has no title (only display_name from persona.name), no temperature, no max_tokens, no model. The user can no longer find the title field at all.

## Severity
medium

## Fix direction
Extend the insert values to populate the actor's settings JSON with `{persona: { title, temperature, max_tokens, model }}` OR map individual fields where natural columns exist (welcome_message, personality). At minimum, document which persona fields are not transferred.


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
