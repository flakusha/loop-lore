<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Lore Specification

**Status:** Draft — lore model, audience scoping (§3), and per-viewer memory injection (§2.2) match the implementation; world timeline + event→lore promotion are aspirational
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

Lore is the persistent _knowledge_ of a world: facts, histories, and beliefs that
characters, races, and professions may or may not know. This spec defines:

1. **The lorebook data model** (what is implemented today).
2. **Audience scoping** — how lore is restricted to races/professions/locations so that
   _different actors have different knowledge_. (e.g. _dark elves know the underground
   castle was abandoned, but humans never heard of it_).
3. **Injection** — how audience-appropriate lore reaches a character's prompt, as a pair
   with memory injection so no knowledge leaks through either path.
4. **World timeline** — backstory seeding, forward event steering, and cross-story
   convergence (aspirational / greenfield).

> Lore is distinct from **memory** (`docs/spec/memory-system.md`): memory is _experience_ a
> character personally accumulates; lore is _shared/structural knowledge_ about the world,
> often authored by the GM or seeded into `world_lore_entries`.

---

## 1. Lorebook Data Model (Implemented)

Two lore tables exist, both a "lorebook" of entries with selective activation:

### 1.1 `world_lore_entries` (per-world lore)

| Column             | Type            | Purpose                                              |
| ------------------ | --------------- | ---------------------------------------------------- |
| `id`               | text (PK)       |                                                      |
| `world_id`         | text (FK)       | Owning world                                         |
| `name`             | text?           | Display name                                         |
| `content`          | text            | The lore text injected into prompts                  |
| `keys`             | json            | Activation/`secondary_keys` keywords (selective)     |
| `selective`        | int             | If 1, only inject when a key matches current context |
| `constant`         | int             | If 1, always inject (subject to audience scope)      |
| `case_sensitive`   | int             | Keyword match casing                                 |
| `enabled`          | `enabled`/other | Soft-disable                                         |
| `position`         | lore position   | `before_char` / `after_char` ordering hint           |
| `insertion_order`  | int             | Ordering fallback                                    |
| `priority`         | int             | Sorting priority                                     |
| `sort_order`       | int             | Ordering scaffold                                    |
| `cooldown_seconds` | int             | Time before the same entry can fire again            |
| `last_activated`   | text?           | When it last fired (cooldown bookkeeping)            |

Schema mirrors: `src/db/schema-story.ts` (`WorldLoreEntries`), migration `017_lorebook_cooldowns`.

### 1.2 `actor_lore_entries` (per-character book)

Identical shape but `actor_id` FK — a character's private character-book (`character_book`).
CRUD via `src/routes/actor-lore-entries.ts`.

### 1.3 CRUD

Both use the generic entity routes (`src/routes/entity-routes.ts` via
`createEntityRoutes`) with JSON `keys`/`secondary_keys`. Ownership for world entries is
checked against `worlds.owner_id` (or admin) — `src/routes/world-lore-entries.ts`.

---

## 2. Injection (Implemented) — Audience Scoping Now Applies

### 2.1 `loreSection` (`src/assistant/prompt/sections/lore.ts`)

For each prompt build, `loreSection`:

1. Resolves the speaking actor's **identity** once (race, professions, location).
2. Fetches **all enabled `actor_lore_entries` for `actor.id`**.
3. Fetches **all enabled `world_lore_entries` for `chat.world_id`**.
4. Filters **both** through the audience gate (`isLoreVisibleTo`, §3.3) **before** the
   cooldown / `constant` / selective-keyword gates.
5. Injects the joined text as a `system` section wrapped in `<lore>`.

> **Historical gap (verified 2026-08-01, now fixed).** Before migration
> `028_lore_audience_scope`, the world-lore fetch was filtered by world + selective
> keywords only — **no filtering by the speaking actor's race, profession, or current
> location** — so every character in a world-bound chat saw all of that world's lore. The
> "dark elves know, humans don't" intent leaked through the lore section. This is closed:
> world and actor lore are now both gated by `audience_scope` before activation.

### 2.2 Relationship to Memory Injection

Lore and memory are the **two knowledge paths** into a prompt and are treated as a pair —
closing one is not enough, knowledge must not leak through either:

- **Memory path (implemented).** `memorySection` (`src/assistant/prompt/sections/memories.ts`)
  now provisions each chat participant's memories against the **speaker as viewer** (`ownerId`
  vs `viewerId`), so `evaluateShareability` genuinely evaluates owner≠viewer: a memory can be
  _revealed to one party and withheld from another_ (trusted/blocked/shared). (Previously only
  the speaker's own memories were provisioned with `viewerId == ownerId`, making cross-actor
  shareability unreachable; `src/chat/memory-injection.ts` remains dead code with no callers.)
  A single combined token budget (`selectWithinBudget`, 1024) bounds all sources, and
  non-speaking participants are fetched at a per-actor cap to bound cost in large groups.
- **Lore path (implemented).** World lore is now constrained by `audience_scope` (§3), so it
  is not universally injected into every character.

---

## 3. Lore Subjects & Audience Scoping (Implemented)

### 3.1 The Scenario

> The underground castle was **abandoned** centuries ago.
>
> - **Dark elves** know this — it's part of their **racial** culture/internal history.
> - **Humans** have never heard of it.
>
> A **mage** can explain fire spells; a **neurosurgeon** can describe new implant effects and
> surgery. This is **profession**-scoped knowledge.

Knowledge is **derived from world/location lore data structures**, scoped to the actor whose
identity makes it appropriate — not hand-maintained per-actor memory lists. Critically, lore
is **about a subject**, and the subject determines both how it is grouped and who may know it.

### 3.2 Lore Subjects (Taxonomy)

Every lore entry carries a `subject` — what the lore is about. The subject selects the
**audience rule** for that entry:

```typescript
type LoreSubject =
  | { kind: "world" }        // Applies to everyone: past & present world state.
  | { kind: "location"; locationId?: string } // The story of a location: its items, npcs, inhabitants…
  | { kind: "profession"; profession: string } // Knowledge held by those with the matching trait/profession.
  | { kind: "race"; race: string }            // Culture, internal secrets, racial skills/specialities.
  | { kind: "faction" }      // (extensible) e.g. guilds, houses, organizations.
  | { kind: "item" }         // (extensible) lore about a specific item/artifact.
  | // … extend as needed
```

Rationale: a **subject-based** model (vs flat `races`/`professions`/`locations` arrays) matches
how a GM authors lore — "this is _location_ lore about the castle", "this is _race_ lore
about dark elves", "this is _profession_ lore for mages" — and keeps the audience rule
implicit in the subject kind rather than a redundant tag matrix.

### 3.3 Audience Resolution per Subject

For a speaking actor with identity `{ race, professions: string[], locationId }`:

| Subject          | Audience rule (visible iff …)                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `world`          | everyone (applies to all) — subject to normal constant/selective/cooldown gates                                                         |
| `location`       | actor's `locationId` resolves to the entry's location bound (or a location in its child tree), **and** `requires_presence` is respected |
| `profession`     | actor's **race/profession traits** include the entry's profession (e.g. actor has a `profession` trait / `professions.discipline`)      |
| `race`           | actor's resolved **race** trait matches the entry's race                                                                                |
| `faction` (ext.) | actor holds a membership/faction trait matching                                                                                         |
| `item` (ext.)    | actor has the item, or a trait/knowledge permitting it                                                                                  |

### 3.4 Fields on Lore Entries

Add to **both** `world_lore_entries` and `actor_lore_entries` (all optional; empty/null =
no restriction = current behavior):

```typescript
interface LoreScope {
  /** Subject kind + selector. Empty = world (applies to everyone). */
  subject?: LoreSubject;
  /** If true (default for location subjects), location lore is only known while the
   *  actor is present (or in its ancestor tree). If false, the actor holds the lore
   *  even when away. Implemented in `isLoreVisibleTo` (src/assistant/lore/audience.ts). */
  requires_presence?: boolean;
}
```

Storage (**implemented**, migration `028_lore_audience_scope`): a JSON `audience_scope`
column on both lore tables, kept inside the existing entity-route JSON-field handling
(`fieldMappings` + `jsonFields`). Storing `LoreScope` preserves the current entity-route CRUD
shape.

### 3.5 Actor Identity for Matching

> **Schema note (verified 2026-08-01):** `actors` has **no species/race column**. `species`
> exists only in `character_heat_cycle` (niche reproduction table) and as a **trait**.
> Race is resolved from `character_permanent_traits` — this is the established pattern
> (`traits-service.test.ts`: `name="species", value="dark elf"` in `identity` category).

Identity sources (all resolvable now):

- **Race:** `character_permanent_traits` where `trait_name='species'` (via
  `TraitsService.getPermanentTrait(actorId,'species')`, migration `010_character_systems.ts`,
  `schema-character.ts`). Default `human` when absent.
- **Profession:** `character_permanent_traits` `profession`/`class` trait AND/OR
  `professions.discipline` (per-actor, per-world) + `profession_specializations.name`.
  The user's model allows _any_ trait-holder to carry profession knowledge, so prefer a
  trait-based resolver with `professions` as a structured source.
- **Location:** `chats.current_location_id` (already on `AssembleChat`).
- **Faction/membership (ext.):** trait `faction`/`membership` value.

### 3.6 Resolution Rules (implemented)

1. Entry with **no `audience_scope`** → visible to everyone (unchanged behavior).
2. `subject.kind === "world"` → visible to everyone.
3. `subject.kind === "race"` → visible iff actor's resolved race matches `subject.race`.
4. `subject.kind === "profession"` → visible iff any of the actor's race/profession traits
   (or `professions.discipline`) matches `subject.profession`.
5. `subject.kind === "location"` → visible iff the entry's `locationId` matches
   `current_location_id` (or its ancestor tree) and `requires_presence` is honored.
6. Unknown/future subjects → default closed (not visible) until a rule is defined.
7. Audience filtering happens **before** the selective-keyword / `constant` / cooldown gate,
   so forbidden lore is never considered for activation.

> Semantic nuance: "known vs not known" is declared at **authoring time** by choosing the
> subject + scope (who it applies to), not inferred from keywords. A smart default for
> **race** and **profession** subjects is that the _subject_ implies the audience — a
> `profession: "mage"` entry is known by actors with a mage identity, a `race: "dark elf"`
> entry is known by dark elves and unknown to humans.

### 3.7 Scope Resolution Service

A pure resolver (mirroring `src/memory/shareability.ts` style — pure function, unit-tested in
`src/assistant/lore/audience.test.ts`):

```typescript
// src/assistant/lore/audience.ts
interface ActorIdentity {
  race: string; // resolved species trait, default 'human'
  professions: string[]; // profession/class trait values + professions.discipline
  locationId: string | null; // current chat location
}

type LocationInScope = (locId: string, scopeLocId: string,) => boolean;

function isLoreVisibleTo(
  entry: { audienceScope?: LoreScope | null },
  identity: ActorIdentity,
  locationInScope?: LocationInScope,
): boolean;
```

`loreSection` (`src/assistant/prompt/sections/lore.ts`) resolves the actor identity
(race + professions + location) once, then filters **both** the actor- and world-lore
fetches through `isLoreVisibleTo` **before** the existing cooldown/constant/selective gates.

---

## 4. Knowledge via Actions, Battles, Items, Location & World Interactions

Lore is not only dialogue — characters _learn_ by doing. The user's intent: knowledge also
flows through **actions / battles / items / location & world interactions**, and it remains
scoped by the audience model.

### 4.1 Event-Driven Knowledge

`src/story/events/` already extracts typed `WorldEvent`s (`LocationChange`,
`TimeAdvancement`, `WorldLoreUpdate`, `CombatEvent`, `ItemTransfer`, `NpcStateChange`,
`QuestProgress`) from messages, validates them, and applies them to world state
(`src/story/events/{extraction,validation,application}.ts`).

Proposed: **event → lore promotion**. When an event occurs (e.g. a battle is won, a location
is discovered, an item changes hands), the world may create or update a `world_lore_entry`
recording the _new fact_, and optionally tag it with audience scope. This gives a
**propagation loop**: actions mutate the world → become lore → become audience-scoped
knowledge → injected back into appropriate characters' prompts.

**Implemented (2026-08-01):** `promoteEventToLore` (`src/story/events/promote-lore.ts`)
converts a validated event into a structured `world_lore_entries` row with an `audience_scope`
JSON tag (content from `data.newLoreEntry`, falling back to `description`; scope from
`data.audienceScope`, validated against the subject taxonomy in §3.2). `applyWorldLoreUpdate`
now promotes every `world_lore_update` event after its legacy `worlds.lore` text append
(additive; opt out via `data.promoteToLore === false`).

### 4.2 Knowledge Transforms (mapped to subjects)

Each transform produces lore with a matching **subject** (Section 3.2):

- `item` interaction → `subject.kind = "item"` (e.g. a smith knows a metal's secret; a
  commoner does not).
- `location` discovery → `subject.kind = "location"` bound to that location with
  `requires_presence` honored.
- `battle`/`combat` → `subject.kind = "race"`/`"faction"`/`"profession"` about a faction,
  creature, or the studying profession.
- `world`-level change → `subject.kind = "world"` (applies to everyone) or a narrower
  subject if only some should know.
- `npc`/`inhabitant` interactions → `subject.kind = "location"` lore about that location's
  inhabitants (enriching the location's story/items/npcs).

The **world timeline** (Section 5) is the ledger that makes these transforms orderly and
reversible.

---

## 5. World Timeline (Aspirational / Greenfield)

### 5.1 Gap

There is **no chronological world-timeline entity, no backstory ledger, no forward-event
steering queue, and no cross-session convergence/propagation.** `story_events` JSON exists
per session (`db world_events` column); `epic-world-locations.md` sketches a `WorldState`
with `recentEvents`, `history: WorldEvent[]`, `timeline: EvolutionTimeline[]` but none is
built.

### 5.2 Backstory Seeding

A GM (or well-known lore) may introduce events that happened **before** the roleplay began,
as contextual knowledge.

> "The Emperor of Mankind has sat the Golden Throne since 30k."

Proposal: events with an explicit `occurred_at` (timestamp or in-world date) stored in the
world timeline; becomes lore with an audience scope. Seeded pre-RP events render to
characters with matching audience as _established history_, not fresh discoveries.

### 5.3 Forward Event Steering

A GM creates a **steering/teaser** to a future event that **MAY** manifest — not guaranteed.

```typescript
interface FutureEventSteering {
  id: string;
  world_id: string;
  description: string; // teaser text
  manifest_probability: number; // 0-1
  conditions?: string[]; // narrative/state conditions that increase probability
  may_manifest: boolean; // if false, pure atmosphere/red herring
}
```

Steerings are injected (audience-scoped) as _foreshadowing_; they do **not** mutate state
until a resolution decides they materialized (e.g. GM confirmation, triggered condition, or
probability roll).

### 5.4 Cross-Story Convergence

> Separate stories played in **close timelines and locations** may converge and propagate
> events/memories into the **overall context**.

Multiple chats can share a world. Their `WorldEvent`s should be persisted to a shared
**world event timeline** (keyed by `world_id` + optional in-world timestamp), and recent
events propagated into the shared world context consistently. This enables:

- a party in chat A burns a bridge → party in chat B (nearby in time/location) encounters
  the _consequence_;
- shared world lore updates visible to all characters whose audience matches.

Cross-chat propagation must respect the audience model: an event that only dark elves know
should not leak to humans in a sibling chat.

---

## 6. Implementation Status Summary

| Feature                                                                                                                                                                      | Status                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `world_lore_entries` / `actor_lore_entries` CRUD                                                                                                                             | ✅ Implemented                                                                                                                                                                                                                                                                                                                                                                                           |
| `loreSection` keyword/constant/cooldown injection                                                                                                                            | ✅ Implemented                                                                                                                                                                                                                                                                                                                                                                                           |
| World events extract/validate/apply (`src/story/events/`)                                                                                                                    | ✅ Implemented                                                                                                                                                                                                                                                                                                                                                                                           |
| **Audience scoping (race/profession/location)** — `audience_scope` column (migration `028`), resolver `src/assistant/lore/audience.ts`, injected pre-filter in `loreSection` | ✅ Implemented                                                                                                                                                                                                                                                                                                                                                                                           |
| **Per-viewer memory injection** — `memorySection` provisions each participant against the speaker as viewer (`ownerId` vs `viewerId`), combined 1024-token budget            | ✅ Implemented                                                                                                                                                                                                                                                                                                                                                                                           |
| **Event → lore promotion**                                                                                                                                                   | ✅ Implemented — `promoteEventToLore` (`src/story/events/promote-lore.ts`), wired into `applyWorldLoreUpdate` (additive; opt-out `data.promoteToLore === false`)                                                                                                                                                                                                                                         |
| **World timeline — backstory seeding (ledger)**                                                                                                                              | 🟡 Partial — §5.2 done: `world_timeline_events` table (migration `030`), service `src/story/timeline/world-timeline.ts` (`appendTimelineEvents`/`seedBackstory`/`listTimelineEntries`/`getEstablishedHistory`), `applyEvents` hook persists applied events, `seedBackstory` promotes to audience-scoped lore. §5.3 forward-event steering and §5.4 cross-story convergence propagation remain greenfield |

## 7. Related

- `docs/spec/memory-system.md` — memory (experience) vs lore (shared knowledge)
- `docs/spec/worlds.md` — `World.lore: WorldLore`
- `docs/spec/locations.md` — location-bound lore / anomaly "lore entry"
- `src/assistant/lore/audience.ts` — audience resolver (§3)
- `src/assistant/prompt/sections/lore.ts` — `loreSection` audience pre-filter
- `.plan/tickets/IDEA-memory-knowledge-isolation-and-world-timeline.md` — tracking the
  memory + timeline clusters
- `src/story/events/` — world event pipeline
- `docs/spec/llm-queue.md` — generation queue (see note: single llama.cpp instance pooling /
  global limit)
