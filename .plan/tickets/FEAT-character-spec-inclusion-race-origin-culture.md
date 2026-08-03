# FEAT: Character Spec Inclusion of Race, Origin & Culture Identity

**Status:** Open
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-character-spec
**Labels:** character, spec, identity, race, origin, culture, lore, compatibility, trait
**Related:** `FEAT-race-origin-lore-identity-model.md`, `FEAT-race-origin-lore-identity-memory-config.md`, `FEAT-origin-capture-generation-seeding.md`, `docs/spec/character-spec.md`, `src/characters/spec.ts`, `src/characters/services/personality-service.ts`, `src/assistant/lore/audience.ts`, `TASK-character-spec-unified-api.md`

## Summary

Make **race, origin (homeland), and culture** _named, first-class_ identity fields on the canonical character card, and reconcile them with the runtime identity layer that the Lore extensions consume. This is the **character-spec side** of the race/origin lore work: today the setup API carries these values only as opaque `extensions` data, while the lore/identity model reads them from the separate permanent-trait layer — two representations of the same identity that must be bridged without breaking existing cards.

## Background

Two representations of character identity currently coexist, unconnected:

1. **Canonical character card** (`src/characters/spec.ts` → `CanonicalCharacter`, spec'd in `docs/spec/character-spec.md`) is the authoring/setup surface. It declares `name`, `description`, `personality`, `scenario`, `lorebook`, `assets`, and an `extensions?: CharacterExtensions` map (`stats`, `inventory`, `relationships`, `world_modifiers`, `plugin_bundle`, `feature_flags`, plus `[key: string]: unknown`). There is **no named `race`/`origin`/`culture` field** — today they can only ride inside `extensions` (e.g. `extensions.race`).
2. **Permanent-trait identity layer** (`src/characters/services/personality-service.ts`, `character_permanent_traits`) is the runtime source. `IMMUTABLE_TRAITS` already pins `species`, `homeland`, and `culture` (background category). The Lore audience model (`src/assistant/lore/audience.ts` `ActorIdentity`) resolves identity from this layer — this is what `FEAT-race-origin-lore-identity-model.md` extends.

`FEAT-origin-capture-generation-seeding.md` already requires `/create` to persist `origin` → `homeland` and `culture` onto permanent traits. That populates the **runtime** layer but leaves the **card** layer unpopulated: a card exported or edited through the setup API would not round-trip origin/culture, and `extensions` values are not validated against or promoted to the trait layer.

This ticket makes the card (a) _include_ these as recognized fields and (b) _stay compatible_ with the runtime layer and with legacy cards.

## Scope

### 1. Named identity fields on the canonical card

Add optional, identity-scoped fields to `CanonicalCharacter` (mirroring the permanent-trait naming so the mapping is direct):

```typescript
export interface CanonicalCharacter {
  // ...existing fields...
  /* Identity — mapped 1:1 to character_permanent_traits identity/background */
  species?: string; // → species trait  (race)
  homeland?: string; // → homeland trait (origin)
  culture?: string; // → culture trait
  gender?: string; // → gender trait
  age?: string | number; // → age trait
  // ...existing fields...
}
```

- All optional — **no mandatory-field change**, so existing cards validate unchanged.
- `species` preferred over `race` because the runtime trait and `ActorIdentity` already use `species`; an import alias maps SillyTavern/V2 `race` → `species` on import.
- Keep `extensions` untouched for plugin data; these named fields are the canonical, validated surface.

### 2. Card ⇄ permanent-trait reconciliation (single source of truth)

- Authoritative direction: **permanent-trait layer** is source of truth (runtime identity), card is the authoring mirror.
- On **create/update via setup API**: write `species`/`homeland`/`culture` to `character_permanent_traits` (through the existing `personality-service` write path) so the lore layer sees them. Follow the immutable-trait rule: identity/background traits are immutable after creation (`IMMUTABLE_CATEGORIES` `identity`/`background`), so card edits that change them post-creation either apply to the permanent traits through the intentional immutable-override path or are rejected consistently with current trait semantics.
- On **export**: emit the canonical fields from permanent traits so a card round-trips (no `extensions`-only leakage).
- On **import**: `race` → `species`, `homeland`/`origin` → `homeland`, `culture` → `culture`; promote into permanent traits on activation.
- If card `extensions.race`/`extensions.homeland`/`extensions.culture` already exist on legacy cards, **migrate them up** into the named fields (see §4) — no data stranded in `extensions`.

### 3. Feature-flag & validation integration

- Extend the §7.3 `CharacterFeatureFlags` opt-in to gate identity-driven lore/memory behavior: add `identity_lore?: boolean` alongside the existing `traits` / `lorebook` flags. When off (default), the presence/absence of the fields is inert for lore injection — preserving current behavior for cards that do not opt in.
- Add these to **optional-field validation** (`src/characters/validator.ts`): length/cardinality constraints (e.g. `species` ≤ 64 chars, `homeland` ≤ 128, `culture` ≤ 128) in strict mode; skipped in relaxed mode — matching the existing strict/relaxed contract.
- `WorldValidationRules.required_fields` may require these per-world (e.g. a world that mandates culture-bearing characters); validation already supports `required_fields`, so no new mechanism needed.

### 4. Migration & schema

- Bump the card/migration version to include the new optional fields; mark them **auto-fillable** from either permanent traits or legacy `extensions.race|homeland|culture`.
- Migration status semantics preserved (`migration-ready`/`partial`/`blocked`): cards missing identity fields remain `migration-ready` because the fields are optional; only worlds/features that _require_ them would report `partial`.
- Publish the fields in `schemas/character-card.json` for LSP/IDE support.
- No DB column change required (traits already exist); this is card-model + validation + mapping only. `data_source_format`/YAML/TOML round-trip carries the new fields naturally.

### 5. Seeding

- Seed templates (`src/characters/seed.ts`, `feature-character-template-seeding.md`) gain optional `species`/`homeland`/`culture` so templates can author culture-bearing identities consistently with the `/create` outputs of `FEAT-origin-capture-generation-seeding.md`.

## Acceptance Criteria

- [ ] `CanonicalCharacter` exposes optional `species`/`homeland`/`culture` (+ `gender`/`age`) named fields
- [ ] Create/update via setup API populates the corresponding permanent traits (lore layer observes them)
- [ ] Export round-trips the identity fields (no `extensions`-only leakage)
- [ ] Import maps `race`→`species`, `origin`→`homeland`, `culture`→`culture` and promotes to permanent traits on activation
- [ ] Legacy `extensions.race|homeland|culture` migrated up into named fields on edit/migrate
- [ ] `identity_lore` feature flag gates identity-driven lore/memory (default off → no behavior change)
- [ ] Strict-mode optional-field validation; relaxed mode skips; world `required_fields` honored
- [ ] Migration auto-fills the new fields from traits or `extensions`; `migration-ready` preserved for optional-missing cards
- [ ] `schemas/character-card.schema.json` (and its generator `src/config/generate-character-schema.ts`) includes the fields
- [ ] Identity/trait immutability rule preserved (no silent post-creation identity rewrite)
- [ ] Unit tests: field validation, import mapping, export round-trip, extensions→field migration, flag-gated injection, immutable-trait enforcement
- [ ] `bun run check` + `bun test src/` pass

## Files

- `src/characters/spec.ts` — `CanonicalCharacter` identity fields, `CharacterFeatureFlags.identity_lore`
- `src/characters/validator.ts` + `validator-rules.ts` — optional-field constraints, world `required_fields`
- `src/characters/migration.ts` — auto-fill from traits/`extensions`, version bump
- `src/characters/importers/` + `normalizers/` — `race`→`species` aliasing, trait promotion
- `src/characters/exporters/` — identity-field round-trip
- `src/characters/services/personality-service.ts` — reconcile card writes to permanent traits (read-only reference; use existing write/immutable path)
- `src/characters/seed.ts` — template identity fields
- `schemas/character-card.schema.json` — JSON Schema update (generator: `src/config/generate-character-schema.ts`)
- `docs/spec/character-spec.md` — document the fields, §1.2/§7.3 updates
- `docs/spec/lore.md` — note the card⇄trait bridge

## Notes

- **Compatibility is the contract here**: every new field is optional, defaults preserve current behavior, and the immutable-trait rule is upheld — a card created before this ticket and one after must both validate and inject identically unless the author opts in.
- This depends on the identity **model** (`FEAT-race-origin-lore-identity-model.md`, defines `ActorIdentity` + origin/culture) and the **capture** ticket (`FEAT-origin-capture-generation-seeding.md`, populates permanent traits). The **config** ticket (`FEAT-race-origin-lore-identity-memory-config.md`) consumes the same trailing `homeland`/`culture` values but is otherwise orthogonal.
- File placement: this is an authoring/validation concern, so it belongs to `epic-character-spec` (owner of `TASK-character-spec-unified-api`), not the lore epics.
