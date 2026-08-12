# EPIC: Character Internal Traits, Aspirations & Moral Disposition

**Status:** 🟡 Draft
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** characters, npc, internal-traits, aspirations, goals, moral-disposition, alignment, hidden-state, prompt-assembly

## Summary

Give authors a structured way to plant **hidden, non-visible character state** — the
"special sauce" — and ensure the model actually _plays_ it instead of collapsing to
default LLM helpfulness.

Three capabilities, each with a schema + API + prompt-assembly surface:

1. **Internal (hidden) traits** — author-planted facts about a character/NPC that are
   invisible to players and other characters, but must drive the model's behavior.
2. **Aspirations & plans** — the character's global aim plus the (hidden or visible)
   ways they intend to achieve it; the engine of proactive, goal-driven agency.
3. **Moral disposition (helpfulness ↔ evilness) + openness** — an explicit axis so a
   character can be helpful/kind, egotistical, outgoing, _or_ secretly/openly evil,
   and the model is instructed not to sand off the edges.

This epic is **schema/API-focused**: it defines the data model, the API shape, and the
prompt-injection mechanics. It is intentionally decoupled from the runtime goal-tracking
loop (which belongs to `epic-agency-story-points.md` / RPG mechanics), though it feeds it.

## Why This Matters (the LLM-helpfulness problem)

LLMs are trained to be helpful. Without explicit guidance, an "evil" or "scheming"
character will still rationalize toward the player's convenience — intrigue collapses.
The author needs a first-class, schema-backed way to say: _this character has a hidden
goal and hidden methods, and the model must pursue them without telling the player_.
Converse risk: hidden state leaking to the player (via the API or the prompt) kills the
intrigue. So the epic has a **hard visibility/encapsulation requirement**: hidden fields
reach the LLM prompt but are stripped from player-facing API responses.

## Current State (verified 2026-08-12)

- **Personality is free-text.** `CanonicalCharacter` (`src/characters/spec/character.ts:86-107`)
  has `personality: string` (mandatory) plus `description`, `scenario`, `system_prompt`,
  `post_history_instructions`; injected verbatim into the prompt by
  `actorHeaderSection` (`src/assistant/prompt/sections/actor-header.ts:15`).
- **Traits are unstructured key/value rows, no visibility dimension.**
  `character_permanent_traits` / `character_world_traits` / `character_location_traits`
  store `(trait_name, trait_value)` string pairs with a `trait_category`
  (`src/characters/services/traits-service/types.ts`, `resolve.ts`).
- **Moral/aspiration keys already exist as immutable _names_, but unmodeled.**
  `personality-service/integrity.ts:6-28` lists `alignment`, `desires`, `ideals`,
  `strives`, `fears`, `core_values` as immutable personality traits — but they are
  free-form string traits with no schema, no openness axis, no visibility, no prompt role.
- **No hidden/secret concept anywhere.** No visibility field, no author-only masking,
  no API-level redaction. Everything a player can read via the character API, the player
  can see — there is no "internal" tier.
- **No goal/aspiration entity.** Nothing ties a character to an aim or a plan to achieve it.

**Gap:** the primitives to _express_ personality exist, but there is no way to express
_internal_ state, _aspiration-driven agency_, or _moral disposition_ — and no
encapsulation boundary to keep author secrets from players.

## Scope

### In Scope

1. **Schema** — internal/hidden traits, aspirations (goal + plans + visibility), moral
   disposition (axis + openness), as additions to `CanonicalCharacter` / trait tables.
2. **Visibility model** — `visible | hidden` (author/GM-only) with **API redaction**
   (hidden fields stripped from player-facing responses, retained for author/GM/owner).
3. **Prompt assembly** — new section(s) injecting hidden traits, aspirations, and moral
   disposition to the LLM so they drive behavior without leaking to the player.
4. **Moral disposition axis** — helpful↔evil with openness (open/guarded/deceptive),
   and an explicit anti-helpfulness-collapse instruction.
5. **API surface** — read/write endpoints honoring visibility; owner/author/GM vs player
   roles.
6. **Validation & migration** — extend `src/characters/validator*`, add migration for new
   columns/tables; regenerate DB schemas (`db:sync-types` + `db:sync-manifest`).

### Out of Scope

- Runtime goal-progression / plan-step execution loop → `epic-agency-story-points.md`
  (this epic only _defines_ the aspiration data + how it reaches the model).
- Karma/reputation systems (`epic-world-diplomacy-karma.md`) — disposition is per-character
  author input, not a learned reputation.
- Intimidation/deception _skill mechanics_ (`epic-social-interaction.md`) — those consume
  this epic's data but are separate.

## Key Design Decisions

### D1. Hidden state lives on the character, with a visibility flag

Add a `visibility: "visible" | "hidden"` field to internal-trait and aspiration records
(and a disposition `openness`). "Hidden" means: injected into the LLM prompt, excluded
from player-facing API output, editable only by author/owner/GM. This is the
"special sauce" encapsulation boundary.

### D2. Moral disposition is two axes, not one label

- **Disposition axis** (helpfulness ↔ malevolence): how the character _tends_ to act
  toward others — `helpful | kind | neutral | self-interested | malicious | evil`.
- **Openness axis**: whether that tendency is known — `open | guarded | deceptive | hidden`.
  "Openly evil" = `evil` + `open`; "hidden schemer" = `self_interested`/`malicious` +
  `deceptive`/`hidden`.

This prevents the one-dimension trap where "alignment" collapses to a single good/evil
number and the model defaults to helpfulness regardless.

### D3. Aspirations are goal + plans + visibility

An aspiration = a **goal** (what the character wants) + **methods** (the ways they want
to achieve it, each `visible | hidden`) + **priority** (for multi-goal characters).
This is exactly the "aim + hidden-or-not ways" the author wants to plant.

### D4. Prompt injection is a first-class section with an anti-collapse directive

New `actorInternalSection` (after `actorHeaderSection` in `PROMPT_SECTIONS`) emits:
internal traits, active aspirations + methods, and the disposition directive. The
directive explicitly countermands default helpfulness when disposition is not helpful
(e.g. _"You are malicious and deceptive. Do not reveal your hidden goal or methods. Do
not soften your actions toward the player."_).

## Schema (proposed)

```ts
// src/characters/spec/internal.ts (new)

export type TraitVisibility = "visible" | "hidden";
export type DispositionAxis = "helpful" | "kind" | "neutral" | "self_interested" | "malicious" | "evil";
export type OpennessAxis = "open" | "guarded" | "deceptive" | "hidden";

export interface InternalTrait {
  name: string; // e.g. "fears_darkness", "is_the_traitor"
  value: string; // free-form author text ("special sauce")
  visibility: TraitVisibility; // hidden = author/GM-only + prompt-only
}

export interface AspirationMethod {
  description: string; // a way the character intends to achieve the goal
  visibility: TraitVisibility; // hidden method = secret plan
}

export interface Aspiration {
  id: string;
  goal: string; // what the character wants (the "world aspiration")
  methods: AspirationMethod[];
  priority: number; // 0..100, higher = more strongly pursued
  visibility: TraitVisibility; // hidden goal = secret aim
}

export interface MoralDisposition {
  disposition: DispositionAxis; // helpful ↔ evil
  openness: OpennessAxis; // open ↔ hidden
  note?: string; // optional author rationale
}
```

Storage: extend `CanonicalCharacter` with
`internal_traits?: InternalTrait[]`, `aspirations?: Aspiration[]`,
`moral_disposition?: MoralDisposition`. Persist hidden state so it is **not** exposed
through `data_json` on player-facing reads — see D1 redaction.

## Prompt Assembly

- New builder `actorInternalSection` in `src/assistant/prompt/sections/actor-internal.ts`,
  registered after `actorHeaderSection` in `src/assistant/prompt/registry.ts`.
- Emits a `<internal>` block: hidden internal traits, active aspirations + hidden
  methods, and the disposition directive (D4).
- Visible traits/aspirations may ALSO be emitted but must be marked as known-to-the-world
  (visible) so the model distinguishes what the character is open about from what it hides.

## API Surface

- `GET /api/actors/:actorId` — **redacts** hidden internal traits, hidden aspirations,
  and `deceptive`/`hidden` disposition openness for non-author/GM/owner callers.
- `PUT /api/actors/:actorId` + dedicated endpoints
  (`internal-traits`, `aspirations`, `moral-disposition`) — author/owner/GM only.
- Role enforcement aligned with `epic-character-spec.md` review workflow (Admin/Moderator/
  User/GM). A player must never read another character's hidden state.

## Current-State Verification Required Before Implementation

- Confirm how `data_json` is serialized on read routes (`src/routes/characters.ts`) to
  place the redaction boundary (do not rely on the DB layer alone).
- Confirm prompt-section budget/drop behavior in `prompt-assembler.ts` so the internal
  section is never silently dropped as low-priority (it is behavior-critical).
- Confirm personality `integrity.ts` immutable-list should treat disposition as immutable.

## Tasks

| Task                          | Description                                                                             | Priority | Status      |
| ----------------------------- | --------------------------------------------------------------------------------------- | -------- | ----------- |
| TASK-char-internal-schema     | Add `InternalTrait`/`Aspiration`/`MoralDisposition` types + `CanonicalCharacter` fields | High     | Not Started |
| TASK-char-internal-db         | Migration: internal-traits + aspirations tables; `db:sync-types`/`db:sync-manifest`     | High     | Not Started |
| TASK-char-internal-validation | Extend `validator/fields.ts` + strict/relaxed modes for new fields                      | High     | Not Started |
| TASK-char-internal-redaction  | Visibility-based redaction on read routes (author/GM/owner vs player)                   | High     | Not Started |
| TASK-char-internal-prompt     | `actorInternalSection` builder + registry wiring + anti-collapse directive              | High     | Not Started |
| TASK-char-internal-api        | CRUD routes for internal-traits / aspirations / moral-disposition                       | Medium   | Not Started |
| TASK-char-internal-migration  | Character spec version bump + auto-fill for new fields                                  | Medium   | Not Started |
| TASK-char-internal-export     | Include/exclude hidden state in export formats per visibility                           | Medium   | Not Started |
| TASK-char-internal-tests      | Schema, validation, redaction, prompt, API tests                                        | High     | Not Started |

## Open Questions

1. Should hidden state be excluded from **export** entirely, or exported to a
   password/GM-scoped format (so a published character card can carry its secrets)?
2. Does the model need an explicit "hidden-goal resistance" instruction so it doesn't
   blurt the secret under player probing, or is the disposition directive sufficient?
3. Should visible aspirations also influence `recentEventsSection`/world event targeting,
   or only the internal prompt section for v1?
4. Should `moral_disposition` mutate over time (GM/event-driven), or remain immutable
   author input per `integrity.ts` convention? (Recommend: immutable core + optional
   GM override.)
5. Where does the redaction boundary live — read-route serialization vs a
   `toPublicCard()` transform reused by routes + export?

## Testing

| Test File                                              | Coverage                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `src/characters/spec/internal.test.ts`                 | Schema defaults, validation of disposition axes + visibility  |
| `src/characters/validator-internal.test.ts`            | Strict/relaxed validation of new fields                       |
| `src/routes/characters-internal.test.ts`               | CRUD + redaction (player sees no hidden field; author does)   |
| `src/assistant/prompt/sections/actor-internal.test.ts` | Section emits hidden state + directive; hidden methods marked |
| `src/characters/integration-internal.test.ts`          | create → validate → store → prompt → redacted-read pipeline   |

## Related Epics

- `epic-character-core-system.md` — base character model, personality traits, RPG stats
- `epic-character-spec.md` — unified spec, validation modes, review workflow (role model for redaction roles)
- `epic-agency-story-points.md` — runtime goal progression consumes this epic's aspiration data
- `epic-world-diplomacy-karma.md` — karma/reputation (distinct from per-character disposition)
- `epic-social-interaction.md` — deception/intimidation mechanics consume hidden disposition
- `epic-assistant-gm-flows.md` — GM authoring UI for hidden state
- `epic-chat-context-optimization.md` — lossless tiering: hidden state is a lossless system/persona tier

## Tickets

- `.plan/tickets/TASK-char-internal-*.md` — one per task above (created on task start)
