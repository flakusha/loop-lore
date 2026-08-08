# FEAT: Seed Default Characters with Race/Origin/Culture Identity

**Status:** Open
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-character-spec
**Labels:** seeding, character, identity, race, origin, culture, lore, trait
**Related:** `FEAT-character-spec-inclusion-race-origin-culture.md`, `FEAT-race-origin-lore-identity-model.md`, `FEAT-race-origin-lore-identity-memory-config.md`, `FEAT-origin-capture-generation-seeding.md`, `FEAT-seed-default-characters-avatar.md`, `src/characters/seed.ts`, `src/config/sections/characters.ts`, `src/characters/services/traits-service.ts`, `src/characters/services/personality-service.ts`, `src/assistant/lore/audience.ts`, `.plan/epics/epic-character-core-system.md`

## Summary

Wire the **character seeder to persist identity traits**, then add race/origin/culture example extensions to the built-in default characters. The template _examples are only useful if the backing logic is wired_ — today `seedCharacterTemplates` inserts into `actors` only and never writes `character_permanent_traits`, so every seeded character resolves `ActorIdentity.race === "human"` and carries no homeland/culture at all. This ticket's primary deliverable is that missing wiring; populating the built-in templates is the consequence.

## Background

Grounded in `src/`:

- **Runtime identity layer is implemented.** `traits-service.createPermanentTrait` (`src/characters/services/traits-service.ts:77`) writes `character_permanent_traits` rows with `trait_category` = `identity` | `background` | … and `immutable: 1`. `src/assistant/lore/audience.ts:37` resolves `ActorIdentity.race` from `trait_name='species'`, and `src/assistant/prompt/sections/lore.ts:59` reads the same table. `IMMUTABLE_TRAITS` (`personality-service.ts:17-39`) pins `species` under `identity`, `homeland`/`culture`/`education` under `background`.
- **Seeder is NOT wired.** `seedCharacterTemplates` (`src/characters/seed.ts:70-94`) inserts only into `actors` (`description`, `personality`, `scenario`, `welcome_message`, `system_prompt`, …) and **calls no `createPermanentTrait`**. `TraitCategory` has `identity`/`background` values available.
- **`CharacterTemplate` (`src/config/sections/characters.ts:10-45`) has no identity fields** — the 4th ticket (`FEAT-character-spec-inclusion…`) specs these on `CanonicalCharacter`, but the seed template type is a separate surface that must be extended in code.

So: even if we added `species:`/`homeland:`/`culture:` to a YAML template today, the seeder would silently drop them. This ticket closes that gap.

## Scope

### 1. Extend `CharacterTemplate` with identity fields (code, in `src/config/sections/characters.ts`)

```typescript
export interface CharacterTemplate {
  // ...existing...
  /* Identity — persisted as character_permanent_traits at seed time */
  species?: string; // trait: identity/species
  gender?: string; // trait: identity/gender
  age?: string | number; // trait: identity/age
  homeland?: string; // trait: background/homeland  (origin)
  culture?: string; // trait: background/culture
}
```

Optional — no template is required to set them; absence = current behavior (no identity traits written).

### 2. Persist identity traits in the seeder (primary deliverable)

In `seedCharacterTemplates`, after the `actors` insert succeeds, write one `character_permanent_traits` row per provided identity field via the existing write path:

- `species`/`gender`/`age` → `TraitCategory.Identity`
- `homeland`/`culture` → `TraitCategory.Background`
- `immutable: 1` (matches current trait semantics; identity/background are immutable)

Use `createPermanentTrait` from `traits-service` (or the equivalent `insertInto("character_permanent_traits")` if the seeder should avoid service dependencies — prefer the service to keep trait invariants in one place). Wrap trait writes in the same per-template try/catch as the `actors` insert; a trait-write failure must not roll back an already-inserted actor silently — log and record in `result.errors` so the mismatch surfaces.

Guarantee: seeded actors now resolve correct `ActorIdentity.race`/homeland/culture through the existing lore path with **no change to lore code** — this ticket only makes the seeder feed the already-implemented layer.

### 3. Add example identity extensions to built-in defaults

Populate `CHARACTERS_DEFAULTS.templates` so each built-in character demonstrates the dimensions consistently with its fiction and with `FEAT-origin-capture-generation-seeding.md` `/create` conventions (`origin` → homeland, `culture` → culture, `species` → race):

| Template                 | species       | homeland                        | culture                     |
| ------------------------ | ------------- | ------------------------------- | --------------------------- |
| `tpl-elara-nightwhisper` | `high elf`    | `Whispering Library (Celestia)` | `Scholar of the old tongue` |
| `tpl-aria-7`             | `synthetic`   | `starship Horizon`              | `Proxima colony crew`       |
| `tpl-detective-morgan`   | `human`       | `Seattle, Washington`           | `Pacific Northwest noir`    |
| `tpl-dr-thorne`          | `human`       | `Boston, Massachusetts`         | `Academic-skeptic`          |
| `tpl-yuki-tanaka`        | `human`       | `Tokyo, Japan`                  | `Modern slice-of-life`      |
| `tpl-assistant`          | `—` (omitted) | `—`                             | `—`                         |

`tpl-assistant` intentionally omits identity — it is the "neutral" case proving the optional/backward-compatible path (no traits written, existing behavior preserved). Keep every identity field **optional and correct for the fiction**: these are _examples_ to exercise the wiring, not mandatory data.

### 4. Update `feature-character-template-seeding.md`

Document: template identity fields, how they map to `character_permanent_traits` categories, and that seeding is idempotent (already-seeded actors are skipped — identity fields apply only on first seed; provide reseed guidance for test/dev).

## Acceptance Criteria

- [ ] `CharacterTemplate` exposes optional `species`/`gender`/`age`/`homeland`/`culture`
- [ ] Seeding a template with identity fields writes the corresponding `character_permanent_traits` rows (`identity`/`background` categories, `immutable: 1`)
- [ ] A freshly seeded `tpl-elara-nightwhisper` resolves `ActorIdentity.race === "high elf"` (not the `"human"` fallback) through the existing lore path — **no lore code change**
- [ ] Templates omitting identity fields seed with zero trait rows (existing behavior preserved)
- [ ] Trait-write failure is logged/recorded without corrupting the actor insert or crashing the batch
- [ ] Built-in defaults carry the example identity values (except `tpl-assistant`)
- [ ] Idempotency preserved: re-seeding skips existing actors and does not duplicate traits
- [ ] Unit tests: template→trait mapping, category assignment, omitted-field no-op, idempotent reseed, lore identity resolution for a seeded character
- [ ] `bun run check` + `bun test src/` pass

## Files

- `src/config/sections/characters.ts` — extend `CharacterTemplate`, populate `CHARACTERS_DEFAULTS`
- `src/characters/seed.ts` — persist identity traits after actor insert (primary change)
- `src/characters/services/traits-service.ts` — reuse `createPermanentTrait` (read-only if seeded here)
- `src/characters/seed.test.ts` — seeding identity tests
- `.plan/epics/epic-character-core-system.md` — document identity seeding

## Notes

- **This ticket does the wiring; it is not just "add example extensions."** The seeder change is the deliverable; the built-in template values are the exercise of it. Do not merge this as "templates updated" while the seeder stays trait-less — that would leave the exactly-broken state the user flagged.
- Depends on `FEAT-character-spec-inclusion-race-origin-culture.md` for the canonical field model + `feature_flags.identity_lore` opt-in (a seeded character with identity traits still injects identically unless the lore-config epic activates; identity _traits_ are data, the flag governs lore behavior).
- Complements `FEAT-origin-capture-generation-seeding.md` (runtime `/create` identity) — this is the static seed/config path.
