# EPIC: Character Internal Traits, Aspirations & Moral Disposition

**Status:** 🟡 Draft — extended with behavioral dimensions (D7–D9: coping, approach, autonomy)
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** characters, npc, internal-traits, aspirations, goals, moral-disposition, alignment, hidden-state, prompt-assembly, coping, approach, autonomy, free-will

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
4. **Behavioral dimensions** — coping mechanisms (stress response), approach tendencies
   (behavioral method), and autonomy/free will (group vs solo preference). These are
   the "how" behind personality's "who" and disposition's "what."

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
- **Frontend has no visibility tiering.** The character edit form is a single
  server-rendered template — `serveCharacterEditForm` (`src/routes/views/characters.ts:41`)
  — that renders every field (`personality`, `description`, `system_prompt`, …) to whoever
  reaches the route; the `characters.html` grid and `characters/detail-modal.html` likewise
  show everything. There is no per-field visibility, no author-vs-player split, no masking.

**Gap:** the primitives to _express_ personality exist, but there is no way to express
_internal_ state, _aspiration-driven agency_, _moral disposition_, _coping strategies_,
_approach tendencies_, or _autonomy preferences_ — and no encapsulation boundary to
keep author secrets from players.

## Scope

### In Scope

1. **Schema** — internal/hidden traits, aspirations (goal + plans + visibility), moral
   disposition (axis + openness), coping profile, approach tendency, autonomy preference,
   as additions to `CanonicalCharacter` / trait tables.
2. **Visibility model** — `visible | hidden` (author/GM-only) with **API + UI redaction**
   (hidden fields stripped from player-facing responses and the player character card /
   settings, retained for author/GM/owner).
3. **Prompt assembly** — new section(s) injecting hidden traits, aspirations, moral
   disposition, coping, approach, and autonomy to the LLM so they drive behavior
   without leaking to the player.
4. **Moral disposition axis** — helpful↔evil with openness (open/guarded/deceptive),
   and an explicit anti-helpfulness-collapse instruction.
5. **Behavioral dimensions** — coping (stress response pattern), approach (behavioral
   method), autonomy (group vs solo preference) — the "how" behind personality.
6. **API surface** — read/write endpoints honoring visibility; owner/author/GM vs player
   roles.
7. **Frontend visibility** — two view tiers: a player-facing card/settings that renders
   only visible traits, and an author/GM editor that renders hidden fields with a
   "hidden from players" affordance.
8. **Validation & migration** — extend `src/characters/validator*`, add migration for new
   columns/tables; regenerate DB schemas (`db:sync-types` + `db:sync-manifest`).

### Out of Scope

- Runtime goal-progression / plan-step execution loop → `epic-agency-story-points.md`
  (this epic only _defines_ the aspiration data + how it reaches the model).
- Karma/reputation systems (`epic-world-diplomacy-karma.md`) — disposition is per-character
  author input, not a learned reputation.
- Intimidation/deception _skill mechanics_ (`epic-social-interaction.md`) — those consume
  this epic's data but are separate.
- Mood state management (`TASK-character-mood-happiness.md`) — coping _activates_ when mood
  drops, but mood state itself is managed by the mood service.
- Relationship graph queries (`TASK-character-relationships.md`) — autonomy and coping
  _reference_ relationship strength, but the graph itself is managed by the relationships service.

## Key Design Decisions

### D1. Hidden state lives on the character, with a visibility flag

Add a `visibility: "visible" | "hidden"` field to internal-trait and aspiration records
(and a disposition `openness`). "Hidden" means: injected into the LLM prompt, excluded
from player-facing API output **and player-facing UI**, editable only by author/owner/GM.
This is the "special sauce" encapsulation boundary — it must hold in settings and the
character card, not just the API, or the mystery dies at the first click.

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

### D5. Per-field visibility resolves the public-domain conflict

The visibility flag is a **per-field author choice**, not a global default. This is the
answer to the obvious tension: a public-domain character (Dracula, Sherlock, a folklore
archetype) has no mystery to protect — the author marks disposition `open` and traits
`visible`, and they render in settings exactly as they do today. An original "special
sauce" character marks the same fields `hidden`, and they disappear from the player's
view (API + UI) while still driving the model. The same character can mix both: public
surface traits (what the world knows) plus hidden internal ones (the actual secret).

### D6. Player UI shows only what the character is open about

Two rendered tiers, not one:
- **Player-facing** (character card / settings / detail modal): renders only `visible`
  traits and `open` disposition. Presence of hidden fields is never hinted — no
  "N hidden traits" count, no empty sections.
- **Author/GM editor**: renders all fields, with hidden ones clearly badged
  ("🔒 hidden from players") and a visibility toggle per trait/method/goal.

### D7. Coping mechanisms — how the character handles stress and failure

Mood (from `TASK-character-mood-happiness`) is a **reactive state** — what the
character feels right now. Coping is a **stable behavioral pattern** — what they
_do_ when stressed, failing, or facing setbacks. A "withdraw" coper goes silent
under pressure; a "double_down" coper refuses to accept failure; a "seek_comfort"
coper turns to allies. These are author-planted, not learned.

Coping is distinct from personality (immutable) and mood (reactive state).
It is the _strategy_ behind emotional expression — the bridge between "I feel
bad" and "I act this way when I feel bad."

```typescript
type CopingStyle =
  | "withdraw"         // retreat, isolate, go silent
  | "lash_out"         // anger, aggression, blame others
  | "seek_comfort"     // seek allies, ask for help
  | "rationalize"      // explain it away, minimize
  | "double_down"      // persist harder, refuse to accept failure
  | "adapt"            // flexible, find new approach
  | "deny"             // pretend it didn't happen
  | "compartmentalize"; // push it aside, focus on other things

interface CopingProfile {
  primary: CopingStyle;        // default response to stress
  secondary?: CopingStyle;     // fallback when primary fails or is blocked
  triggers?: string[];         // what events activate coping (e.g. "betrayal", "failure", "loss")
  visibility: TraitVisibility; // hidden = character's coping is a secret
}
```

**Integration with mood:** When happiness drops below a threshold (e.g. `≤40`),
the coping profile activates. The prompt section emits the coping directive so
the model shifts behavior — e.g. _"When stressed, this character withdraws and
becomes terse. Do not have them seek help unless no other option exists."_

**Integration with relationships:** `seek_comfort` coping prefers allies (high
`strength` relationships); `withdraw` coping ignores relationship strength.
The model can use relationship data to determine _who_ the character turns to.

### D8. Approach tendencies — the character's behavioral method

Moral disposition (D2) is what the character **values** (helpful ↔ evil).
Approach tendency is what they **do** — their method of interacting with
problems, people, and opportunities. A "self_interested" disposition +
"manipulative" approach = a schemer who uses others. The same disposition +
"pragmatic" approach = a selfish but honest operator. The combination matters.

```typescript
type ApproachTendency =
  | "altruistic"       // help others first, even at cost
  | "pragmatic"        // what works best, no moral weight
  | "opportunistic"    // take advantage when it appears
  | "manipulative"     // use others for own goals
  | "destructive"      // tear things down to rebuild
  | "constructive"     // build things up, find solutions
  | "avoidant"         // avoid conflict and difficult choices
  | "confrontational"; // seek out conflict, challenge directly

interface ApproachProfile {
  tendency: ApproachTendency;
  context_dependent: boolean; // does approach change by situation? (if true, emit context rules)
  contexts?: Array<{          // optional: situation-specific overrides
    situation: string;        // e.g. "combat", "negotiation", "romance"
    tendency: ApproachTendency;
  }>;
  visibility: TraitVisibility;
}
```

**Anti-collapse directive:** When approach is NOT "altruistic", the prompt must
explicitly countermand default LLM helpfulness: _"This character's approach is
manipulative. They will not help the player unless it serves their own goals.
Do not rationalize their selfishness away."_

### D9. Autonomy / free will — group vs solo preference

The "free will" dimension: does the character prefer to stay with the party,
go solo, or split off when it suits them? This drives **proactive agency** —
the character's willingness to make independent decisions, explore alone, or
defy the group's direction.

This is distinct from personality (which defines _who they are_) and
relationships (which define _who they're connected to_). Autonomy defines
_how they move through the world_ — the behavioral signature of independence.

```typescript
type AutonomyPreference =
  | "loyal"        // stays with group, follows leader, resists separation
  | "independent"  // prefers solo but will cooperate when needed
  | "loner"        // actively avoids group, prefers solitude
  | "social"       // seeks group, dislikes being alone
  | "situational"  // depends on context, goals, mood
  | "leader"       // takes charge, directs group decisions
  | "follower"     // defers to others, goes along with plans
  | "wanderer";    // unpredictable, comes and goes freely

interface AutonomyProfile {
  preference: AutonomyPreference;
  solo_comfort: number;          // 0–100: how comfortable alone
  group_comfort: number;         // 0–100: how comfortable in group
  initiative: number;            // 0–100: likelihood of independent action
  separation_triggers?: string[]; // what causes them to split from group
  reunion_triggers?: string[];   // what brings them back
  visibility: TraitVisibility;
}
```

**Integration with relationships:** Characters with high `strength` relationships
have higher `group_comfort` (the relationship _anchors_ them). A "loyal" character
with a strong ally relationship will resist separation even under stress.
A "wanderer" with weak relationships will drift regardless.

**Integration with aspirations:** A character whose aspiration `priority` is
high and whose autonomy `preference` is "independent" will proactively pursue
their goal even if it means leaving the group. The prompt section emits:
_"This character will pursue their goal of [X] independently. They may leave
the party if the group's direction conflicts with their aim."_

**Integration with coping:** A "withdraw" coper with "loner" autonomy will
physically leave the group when stressed. A "seek_comfort" coper with "social"
autonomy will cling harder. The combination creates distinct behavioral
signatures.

---

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

export type CopingStyle =
  | "withdraw" | "lash_out" | "seek_comfort" | "rationalize"
  | "double_down" | "adapt" | "deny" | "compartmentalize";

export interface CopingProfile {
  primary: CopingStyle;
  secondary?: CopingStyle;
  triggers?: string[];
  visibility: TraitVisibility;
}

export type ApproachTendency =
  | "altruistic" | "pragmatic" | "opportunistic" | "manipulative"
  | "destructive" | "constructive" | "avoidant" | "confrontational";

export interface ApproachProfile {
  tendency: ApproachTendency;
  context_dependent: boolean;
  contexts?: Array<{ situation: string; tendency: ApproachTendency }>;
  visibility: TraitVisibility;
}

export type AutonomyPreference =
  | "loyal" | "independent" | "loner" | "social"
  | "situational" | "leader" | "follower" | "wanderer";

export interface AutonomyProfile {
  preference: AutonomyPreference;
  solo_comfort: number;
  group_comfort: number;
  initiative: number;
  separation_triggers?: string[];
  reunion_triggers?: string[];
  visibility: TraitVisibility;
}
```

Storage: extend `CanonicalCharacter` with
`internal_traits?: InternalTrait[]`, `aspirations?: Aspiration[]`,
`moral_disposition?: MoralDisposition`, `coping?: CopingProfile`,
`approach?: ApproachProfile`, `autonomy?: AutonomyProfile`.
Persist hidden state so it is **not** exposed
through `data_json` on player-facing reads — see D1 redaction.

## Prompt Assembly

- New builder `actorInternalSection` in `src/assistant/prompt/sections/actor-internal.ts`,
  registered after `actorHeaderSection` in `src/assistant/prompt/registry.ts`.
- Emits a `<internal>` block: hidden internal traits, active aspirations + hidden
  methods, disposition directive (D4), and behavioral dimensions (D7–D9).
- Visible traits/aspirations may ALSO be emitted but must be marked as known-to-the-world
  (visible) so the model distinguishes what the character is open about from what it hides.
- **Coping (D7):** emitted conditionally when mood `happiness ≤ 40` or a trigger
  event matches. Includes primary/secondary style and integration note.
- **Approach (D8):** always emitted when set. Anti-collapse directive included
  when tendency is not "altruistic".
- **Autonomy (D9):** always emitted when set. Includes preference, initiative
  score, and separation/reunion triggers. Integration with aspirations and
  relationships referenced in the directive.

## Frontend / UI Visibility

The character edit form is today a single server-rendered template —
`serveCharacterEditForm` in `src/routes/views/characters.ts:41` — that renders every
field (`personality`, `description`, `system_prompt`, …) to whoever reaches the route,
plus `characters.html` grid + `characters/detail-modal.html`. There is no per-field
visibility, and no author-vs-player tiering.

This epic introduces two view tiers (per D6):

1. **Player view** — `characters.html`, `character-edit.html` _read_ mode, and
   `detail-modal.html` render only `visible` traits / `open` disposition /
   `visible` coping/approach/autonomy. Hidden fields are absent — no counts,
   no empty placeholders, no affordance that they exist.
2. **Author/GM view** — the edit form (`serveCharacterEditForm`) gains a
   "hidden from players" badge + visibility toggle per internal trait / aspiration /
   method / coping profile / approach profile / autonomy profile, and per-disposition
   openness. Access is role-gated (author/owner/GM only) so a player who reaches
   the editor still cannot read others' hidden state.

The redaction must live in a **shared `toPublicCard()` transform** (per Open Q5) reused
by both the player API read and the player UI render, so the API and the UI can never
drift apart and leak. The transform must handle all 6 hidden dimensions: internal traits,
aspirations, disposition, coping, approach, and autonomy.

## API Surface

- `GET /api/actors/:actorId` — **redacts** hidden internal traits, hidden aspirations,
  `deceptive`/`hidden` disposition openness, hidden coping profiles, hidden approach
  profiles, and hidden autonomy profiles for non-author/GM/owner callers.
- `PUT /api/actors/:actorId` + dedicated endpoints
  (`internal-traits`, `aspirations`, `moral-disposition`, `coping`,
  `approach`, `autonomy`) — author/owner/GM only.
- Role enforcement aligned with `epic-character-spec.md` review workflow (Admin/Moderator/
  User/GM). A player must never read another character's hidden state.

## Current-State Verification Required Before Implementation

- Confirm how `data_json` is serialized on read routes (`src/routes/characters.ts`) to
  place the redaction boundary (do not rely on the DB layer alone).
- Confirm which endpoint feeds the player character card / details / edit render
  (`src/views/characters.html`, `characters/detail-modal.html`, `character-edit.html` →
  `serveCharacterEditForm`) so the shared `toPublicCard()` transform (D6 / Open Q5)
  covers UI renders, not just API reads.
- Confirm prompt-section budget/drop behavior in `prompt-assembler.ts` so the internal
  section is never silently dropped as low-priority (it is behavior-critical).
- Confirm personality `integrity.ts` immutable-list should treat disposition as immutable.
- Confirm coping/approach/autonomy are expression-layer (mutable by GM/event) not
  personality-layer (immutable) — recommend: expression-layer, like mood.
- Confirm mood service exposes happiness threshold for coping activation.
- Confirm relationship service exposes strength data for autonomy/coping integration.

## Tasks

| Task                          | Description                                                                             | Priority | Status      |
| ----------------------------- | --------------------------------------------------------------------------------------- | -------- | ----------- |
| TASK-char-internal-schema     | Add `InternalTrait`/`Aspiration`/`MoralDisposition`/`CopingProfile`/`ApproachProfile`/`AutonomyProfile` types + `CanonicalCharacter` fields | High     | Not Started |
| TASK-char-internal-db         | Migration: internal-traits + aspirations + coping + approach + autonomy tables; `db:sync-types`/`db:sync-manifest`     | High     | Not Started |
| TASK-char-internal-validation | Extend `validator/fields.ts` + strict/relaxed modes for new fields                      | High     | Not Started |
| TASK-char-internal-redaction  | Visibility-based redaction on read routes (author/GM/owner vs player)                   | High     | Not Started |
| TASK-char-internal-prompt     | `actorInternalSection` builder + registry wiring + anti-collapse directive + coping/approach/autonomy directives | High     | Not Started |
| TASK-char-internal-api        | CRUD routes for internal-traits / aspirations / moral-disposition / coping / approach / autonomy | Medium   | Not Started |
| TASK-char-internal-frontend   | Player card + settings redaction via `toPublicCard()`; author/GM editor visibility badge + toggle | High     | Not Started |
| TASK-char-internal-migration  | Character spec version bump + auto-fill for new fields                                  | Medium   | Not Started |
| TASK-char-internal-export     | Include/exclude hidden state in export formats per visibility                           | Medium   | Not Started |
| TASK-char-internal-tests      | Schema, validation, redaction, prompt, API tests (all 6 behavioral dimensions)          | High     | Not Started |

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
6. **Progressive reveal** — should a `hidden` trait/aspiration surface as `visible`
   (UI + API) when story/GM/event logic exposes it over time (e.g. a secret becomes
   known), or is visibility immutable author input for v1?
7. **Coping activation threshold** — should coping trigger at a fixed `happiness ≤ 40`
   threshold, or should authors set per-character activation points?
8. **Approach context rules** — for `context_dependent: true`, should the model infer
   the situation from chat context, or should the author enumerate all applicable
   contexts explicitly?
9. **Autonomy vs GM control** — when a character's autonomy says "leave the group"
   but the GM/story wants them to stay, which wins? Recommend: GM override with a
   prompt directive explaining the constraint.
10. **Coping + mood feedback loop** — can coping _change_ mood? (e.g. "withdraw" coping
    → isolation → lower happiness → more withdrawal). If so, the prompt must include
    a stabilization directive to prevent spirals.
11. **Relationship-dependent autonomy** — should `group_comfort` be computed from
    relationship data (dynamic), or authored independently (static)? Recommend:
    authored baseline + relationship modifier for v1.

## Testing

| Test File                                              | Coverage                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `src/characters/spec/internal.test.ts`                 | Schema defaults, validation of disposition axes + visibility + coping styles + approach tendencies + autonomy preferences |
| `src/characters/validator-internal.test.ts`            | Strict/relaxed validation of new fields                       |
| `src/routes/characters-internal.test.ts`               | CRUD + redaction (player sees no hidden field; author does)   |
| `src/characters/to-public-card.test.ts`                | `toPublicCard()` redacts hidden traits/aspirations/disposition/coping/approach/autonomy consistently for API + UI renders |
| `src/assistant/prompt/sections/actor-internal.test.ts` | Section emits hidden state + directive; coping triggers on low happiness; approach anti-collapse; autonomy + aspiration integration |
| `src/characters/integration-internal.test.ts`          | create → validate → store → prompt → redacted-read pipeline (all 6 dimensions) |

## Related Epics

- `epic-character-core-system.md` — base character model, personality traits, RPG stats
- `epic-character-spec.md` — unified spec, validation modes, review workflow (role model for redaction roles)
- `epic-agency-story-points.md` — runtime goal progression consumes this epic's aspiration data
- `epic-world-diplomacy-karma.md` — karma/reputation (distinct from per-character disposition)
- `epic-social-interaction.md` — deception/intimidation mechanics consume hidden disposition
- `epic-assistant-gm-flows.md` — GM authoring UI for hidden state
- `epic-chat-context-optimization.md` — lossless tiering: hidden state is a lossless system/persona tier
- `TASK-character-mood-happiness.md` — mood state (coping activates when mood drops)
- `TASK-character-relationships.md` — relationship graph (autonomy + coping reference relationship strength)
- `TASK-character-personality-integrity.md` — immutable personality (behavioral dimensions are expression, not personality)

## Tickets

- `.plan/tickets/TASK-char-internal-*.md` — one per task above (created on task start)
