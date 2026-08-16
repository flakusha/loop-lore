<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Race & Origin (Homeland/Culture) as First-Class Lore Identity Dimensions

**Status:** Open
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems
**Labels:** lore, identity, race, origin, culture, audience
**Related:** `docs/spec/lore.md` §3, `src/assistant/lore/audience.ts`, `FEAT-race-origin-lore-identity-memory-config.md`, `FEAT-origin-capture-generation-seeding.md`, `FEAT-character-spec-inclusion-race-origin-culture.md`, `src/characters/services/personality-service.ts`

## Summary

Promote **origin** (homeland) and **culture** to first-class `LoreSubject` dimensions alongside **race**, so lore/identity knowledge can be scoped by _where_ and _under which culture_ an actor was raised — not just what race they are. Today `race` is the only identity-derived audience gate; a character's homeland and culture are already captured as immutable personality traits but ignored by the lore model.

This is the **identity-model** half of the race-aware lore work. It plugs origin/culture into the existing audience resolver; per-identity _config_ (lore prioritization, identity framing, memory weights) is tracked separately.

## Background

`src/assistant/lore/audience.ts` resolves a speaking actor's identity as:

```typescript
interface ActorIdentity {
  race: string; // from character_permanent_traits, trait_name='species', default 'human'
  professions: string[]; // profession/class traits + professions.discipline
  locationId: string | null;
}
```

The `LoreSubject` taxonomy (mirrored in `docs/spec/lore.md` §3.2 and `src/validation/schemas.ts`) is:

```typescript
type LoreSubject =
  | { kind: "world" }
  | { kind: "location"; locationId?: string }
  | { kind: "profession"; profession: string }
  | { kind: "race"; race: string }
  | { kind: "faction" } // extensible
  | { kind: "item" }; // extensible
```

**Gap:** `origin` / `culture` are not identity dimensions. A GM cannot author lore as "only known to those raised in the Northern Realm" (`origin`) or "elven diaspora court culture" (`culture`) — only by race. Yet the data already exists: `src/characters/services/personality-service.ts` treats `homeland` and `culture` as **immutable background traits** (`IMMUTABLE_TRAITS`, lines 36–37), resolved via the same `character_permanent_traits` layer that already supplies `species` (race).

Consequence without this ticket: `LoreSubject` entries about two human subcultures are indistinguishable by audience — a `race: "human"` entry leaks across all human nations/homelands, and origin-specific knowledge cannot be gated.

## Scope

### 1. Extend the `LoreSubject` taxonomy

```typescript
type LoreSubject =
  | { kind: "world" }
  | { kind: "location"; locationId?: string }
  | { kind: "profession"; profession: string }
  | { kind: "race"; race: string }
  | { kind: "origin"; origin: string } // NEW — homeland / nation / region of birth
  | { kind: "culture"; culture: string } // NEW — cultural identity / diaspora
  | { kind: "faction" }
  | { kind: "item" };
```

New kinds default **closed** until a rule is defined (current `switch` default already returns `false`), so adding the kinds without an audience rule is safe — no accidental leak.

### 2. Extend `ActorIdentity`

Add `origin` and `culture` (both optional → absent means "unconstrained" for those dimensions):

```typescript
interface ActorIdentity {
  race: string;
  origin: string | null; // NEW — resolved 'homeland' trait, default null
  culture: string | null; // NEW — resolved 'culture' trait, default null
  professions: string[];
  locationId: string | null;
}
```

Resolution mirrors the existing race pattern: read `character_permanent_traits` for `homeland` / `culture` (the immutable background traits) — `personality-service.ts` already loads permanent traits, and `resolveCharacterTraits` returns a `resolved: Record<string,string>` map containing them. Prefer reusing `resolveCharacterTraits` (or its trait layer) over a second bespoke query so `homeland`/`culture` resolve identically to `species`.

### 3. Audience rules in `isLoreVisibleTo`

- `subject.kind === "origin"` → visible iff `identity.origin` matches `subject.origin` (case-insensitive, same as `race`).
- `subject.kind === "culture"` → visible iff `identity.culture` matches `subject.culture` (case-insensitive).
- Unknown / unset origin on the actor → not visible for `origin`-scoped entries (closed default).

No change to `world` / `race` / `profession` / `location` behavior.

### 4. Validation

Extend the `LoreSubject` TypeBox schema in `src/validation/schemas.ts` with the two new `kind` variants. Generated lore (`/create`, → `FEAT-origin-capture-generation-seeding.md`) and event→lore promotion (`promoteEventToLore`) can then author `origin`/`culture` subjects; invalid kinds already rejected.

### 5. Spec + tests

- Update `docs/spec/lore.md` §3.2–§3.7 to list the new subject kinds, the `ActorIdentity` fields, and the audience rules.
- Unit tests in `src/assistant/lore/audience.test.ts`: origin/culture exact-match visibility, closed default for absent actor origin, no regression on existing `race`/`profession`/`location` cases.

## Acceptance Criteria

- [ ] `LoreSubject` taxonomy includes `origin` and `culture` kinds (type + TypeBox schema + doc)
- [ ] `ActorIdentity` carries `origin` / `culture`, resolved from `homeland` / `culture` immutable background traits
- [ ] `isLoreVisibleTo` gates `origin`- and `culture`-scoped entries; unknown kinds stay closed
- [ ] `loreSection` resolves the extended identity once and passes it through unmodified callers
- [ ] `docs/spec/lore.md` §3 documents the new subjects + rules
- [ ] Unit tests cover origin/culture matching, closed-default, and existing-race regression
- [ ] `bun run check` + `bun test src/` pass

## Files

- `src/assistant/lore/audience.ts` — `LoreSubject` union + `ActorIdentity` + `isLoreVisibleTo` rules (primary)
- `src/assistant/prompt/sections/lore.ts` — resolve extended identity, feed `isLoreVisibleTo`
- `src/characters/services/personality-service.ts` — reuse `resolveCharacterTraits` for `homeland`/`culture` resolution
- `src/validation/schemas.ts` — `LoreSubject` TypeBox variants
- `docs/spec/lore.md` — §3 documentation
- `src/assistant/lore/audience.test.ts` — new cases

## Notes

- This ticket only makes origin/culture _scoping_ possible. The per-identity _configuration_ (lore prioritization, identity framing, memory weights keyed on race/origin/culture) is `FEAT-race-origin-lore-identity-memory-config.md`; the data-population side (capturing origin/culture during `/create` + seeding) is `FEAT-origin-capture-generation-seeding.md`.
- Filing under `epic-memory-knowledge-systems` (lore/knowledge system epic); the generation half of the same theme lives under `epic-assistant-gm-flows`.
