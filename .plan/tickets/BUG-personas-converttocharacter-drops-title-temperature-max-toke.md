<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: personas convertToCharacter: drops title, temperature, max_tokens, model from persona

**Status:** ✅ Resolved (p3-bugfix-batch, 2026-09-18)
**Priority:** medium
**Effort:** Medium
**Summary:** (see ## Summary)
**Context:** (see ## Observed / ## Evidence)
**Acceptance Criteria:** (see ## Acceptance Criteria)

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


## Resolution

Fixed in dev by `249b379c1` (fix(personas): carry persona tuning into converted actor). Verified 2026-09-18 against current `dev`:

- `src/personas/convert.ts` — `convertPersonaToCharacter()` writes `settings` JSON `{ persona: { title, temperature, max_tokens, model } }` (option (a) of the fix direction); throw on missing persona preserved for the handler's 404 mapping.
- `src/personas/service.ts` — `convertToCharacter()` delegates to the extracted module.
- Regression tests: `src/personas/handlers.test.ts` (all 4 fields carried), `src/personas/service.missing.test.ts` (persona block pinned, nulls preserved).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (JSDoc on `convertPersonaToCharacter` documents the settings contract)

## Acceptance Criteria (original)

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
