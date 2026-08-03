# FEAT: Origin & Culture Capture During Generation / Seeding

**Status:** Open
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-assistant-gm-flows
**Labels:** lore, origin, culture, generation, create, seeding, audience
**Related:** `FEAT-lore-structured-generation-via-assistant.md`, `FEAT-race-origin-lore-identity-model.md`, `FEAT-race-origin-lore-identity-memory-config.md`, `FEAT-character-spec-inclusion-race-origin-culture.md`, `src/assistant/commands/create.ts`, `src/assistant/lore/audience.ts`, `src/story/events/promote-lore.ts`, `src/characters/services/personality-service.ts`

## Summary

Make origin (homeland) and culture **first-class capture outputs** of the generation + seeding pipelines, so the identity dimensions defined in `FEAT-race-origin-lore-identity-model.md` are actually populated. Three gaps:

1. **`/create` entity generation** (`src/assistant/commands/create.ts`) emits prose/entity fields but no structured `origin`/`culture` identity data on generated actors.
2. **Actor lore seeding** does not author `origin`/`culture`-scoped lore entries; generated race lore is the only identity-scoped output.
3. **Event→lore promotion** (`src/story/events/promote-lore.ts`) cannot yet produce origin/culture subject lore (taxonomy lacks the kinds until the identity-model ticket lands).

This ticket is the **data population** companion: once the taxonomy + identity resolution exist, generators should emit and seed origin/culture values and `origin`/`culture`-subject lore.

## Background

`FEAT-lore-structured-generation-via-assistant.md` established that `/create world/loc/char/item` should emit structured `lore[]` arrays (with `audience_scope`, `keys`, `constant`/`selective`) rather than prose — and `/create char` emits `actor_lore_entries` (private book) + race/profession subjects. That foundation does not yet cover origin/culture.

Identity source of truth (verified): `src/characters/services/personality-service.ts` treats `homeland` and `culture` as immutable background traits (`IMMUTABLE_TRAITS`), and race is `species`. `ActorIdentity` (post-identity-model ticket) will carry `{ race, origin, culture, professions, locationId }`. Without capture, origin/culture stay null on generated actors and no origin/culture lore can ever be authored by the generator.

## Scope

### 1. `/create` emits origin/culture identity fields

Extend the `/create char` (and world/loc where nationality/culture applies) LLM output to include `origin` and `culture` alongside name/species:

```json
{
  "name": "Erellis",
  "species": "dark elf",
  "origin": "Underdark",
  "culture": "Drow Court",
  "lore": [ ... ]
}
```

- Persist `origin` → `homeland` trait, `culture` → `culture` trait on the generated actor via the existing permanent-trait write path (`character_permanent_traits`), so they resolve identically to `species`.
- Validation against TypeBox schemas in `src/validation/schemas.ts`.

### 2. Generator authors origin/culture-scoped lore

The `/create char` and `/create loc` `lore[]` outputs may use subject kinds:

- `{ "kind": "origin", "origin": "Underdark" }`
- `{ "kind": "culture", "culture": "Drow Court" }`

Persisted with `audience_scope` on `actor_lore_entries` / `world_lore_entries`; these flow through the audience-gated `loreSection` unchanged (data population only).

### 3. Event→lore promotion supports origin/culture subjects

`src/story/events/promote-lore.ts` validates promoted lore against the subject taxonomy. Once the identity-model ticket adds `origin`/`culture` kinds, allow promotion to emit them (e.g. a `WorldLoreUpdate` whose `data.audienceScope.subject.kind` is `origin`/`culture`).

### 4. Seeding defaults for world context

When a world is created, seed a sensible default identity context so generated NPCs/characters have culture-bearing backstories — e.g. `/create world` may emit a `culture` field and a few `origin`/`culture`-scoped world lore entries describing the nations/regions, which subsequent character generations reference. Keep optional and additive; no seeding = current behavior.

## Acceptance Criteria

- [ ] `/create char` captures and persists `origin` (`homeland`) and `culture` traits
- [ ] `/create char` / `/create loc` can emit `origin`/`culture`-subject lore entries
- [ ] Generated origin/culture entries validate against `LoreSubject` schema
- [ ] Generated entries persist to `actor_lore_entries` / `world_lore_entries` with `audience_scope`
- [ ] Generated entries flow through audience-scoped `loreSection` (no injection regression)
- [ ] Event→lore promotion accepts `origin`/`culture` subject kinds
- [ ] World seeding defaults (nations/regions culture context) are optional + additive
- [ ] Unit tests for generation→parse→persist of origin/culture + audience-scoped injection
- [ ] `bun run check` + `bun test src/` pass

## Files

- `src/assistant/commands/create.ts` — extend char/loc/world prompts + persistence (primary)
- `src/validation/schemas.ts` — `LoreSubject` origin/culture variants (post identity-model) + create output validation
- `src/characters/services/personality-service.ts` — persist `homeland`/`culture` permanent traits
- `src/story/events/promote-lore.ts` — accept origin/culture subjects
- `src/assistant/prompt/sections/lore.ts` — verify injection (no change expected)

## Notes

- Depends on `FEAT-race-origin-lore-identity-model.md` (taxonomy + identity resolution) for the `LoreSubject` kinds and `ActorIdentity.origin`/`culture`.
- Complements `FEAT-lore-structured-generation-via-assistant.md` (which established the structured-lore pipeline this ticket fills with origin/culture data).
- Files decision: this is a generation/creation concern, so it belongs to `epic-assistant-gm-flows` (owner of `/create` and the structured-generation ticket) rather than the knowledge-system epic that owns the identity/config tickets.
