<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Character Internal Traits, Aspirations & Moral Disposition

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** verified 2026-10-09: schema + DB + service + prompt section + API + author-facing edit-form UI ship (`character_internal_traits` table, `src/characters/services/internal-traits/`, `src/assistant/prompt/sections/internal-traits.ts` at registry position with ±30 disposition classification, `src/routes/character-internal-traits/` with owner/admin authz); diverged from the proposed schema (single JSON-columns row, numeric lawful↔chaotic / good↔evil axes, aspiration visibility `hidden|hinted|open`); still open: `toPublicCard()` shared redaction, player-facing two-tier UI, validator/fields coverage, coping prompt rendering + mood-threshold activation, export/migration
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

## Implemented (verified 2026-10-09)

- **Schema + DB** — `character_internal_traits` table
  (`src/db/migrations/001_init.ts:1261`, actor FK cascade +
  `idx_character_internal_traits_actor` at `:1561`); generated row type
  `CharacterInternalTraits` (`src/db/schema-core.ts:449`). Storage is a **sidecar
  row per actor**, not columns on `CanonicalCharacter` — the design's
  "extend `CanonicalCharacter`" note was not the shape that shipped.
- **Service (6 profiles)** — `src/characters/services/internal-traits/`: aspirations,
  moral disposition, autonomy preferences, coping mechanisms, approach tendencies,
  voice patterns, plus a field-level `visibility: string[]` gate. `get` / `upsert` /
  `delete` and `buildPromptSection(actorId, includeHidden)` (`index.ts:209`).
- **Prompt section** — `src/assistant/prompt/sections/internal-traits.ts` exported as
  `internalTraitsSection` and registered at `src/assistant/prompt/registry.ts:55`.
  Renders aspirations, ±30 `lawful_chaotic` × `good_evil` disposition
  classification, approach tendencies and voice patterns, each gated by
  `isVisible()` (`services/internal-traits/prompt-section.ts`).
- **API** — `src/routes/character-internal-traits/index.ts`: `GET` / `PUT` /
  `DELETE /api/character-internal-traits` plus `GET /api/character-internal-traits/prompt`,
  every handler behind `requireActorAccess` (owner or admin). Mounted at
  `src/routes/v1/actors-surface.ts:64` (imported at `:20`).
- **Author edit-form section** — collapsible "Internal Traits & Personality Depth"
  block, `src/routes/views/character-edit-sections.ts:13`
  (`data-testid="internal-traits-section"`), asserted by
  `src/routes/views/character-edit-form.test.ts:103`.
- **Traits page (author-facing)** — `src/frontend/pages/characters-traits.ts` reads and
  writes the same endpoint (visibility select includes `hidden|hinted|open`).
- **Tests** — `services/internal-traits/prompt-section.test.ts`,
  `assistant/prompt/sections/internal-traits.test.ts`,
  `routes/character-internal-traits/index.test.ts` (IDOR owner/admin authz),
  `routes/views/character-edit-form.test.ts`, `frontend/pages/characters-traits.test.ts`.

Baseline that this epic builds on is unchanged: `personality` is still free text on
`CanonicalCharacter` (`src/characters/spec/character.ts`), injected verbatim by
`actorHeaderSection` (`src/assistant/prompt/sections/actor-header.ts:15`), and traits
are still `(trait_name, trait_value)` rows with a `trait_category`
(`src/characters/services/traits-service/types.ts`).

## Current State

| Surface | Status | Where |
| ------- | ------ | ----- |
| `character_internal_traits` table + migration + generated types | Shipped | `src/db/migrations/001_init.ts:1261`, `src/db/schema-core.ts:449` |
| Service, 6 profiles, field-level visibility gate | Shipped | `src/characters/services/internal-traits/` |
| Prompt section + registry wiring | Shipped — 4 of 6 dimensions | `src/assistant/prompt/sections/internal-traits.ts`, `registry.ts:55` |
| Coping + autonomy rendered into the prompt | Not shipped | `buildPromptSection` appends aspirations / disposition / approach / voice only (`index.ts:224-227`) |
| Hard anti-collapse directives (D4 / D8 / D10) | Not shipped | only the generic privacy line (`services/internal-traits/index.ts:217-222`); no per-dimension countermand |
| Owner/admin API (`GET` / `PUT` / `DELETE` / `prompt`) | Shipped | `src/routes/character-internal-traits/index.ts` |
| Player-visible redaction on `GET /api/actors/:actorId` | Not shipped | no `toPublicCard()`; only `requireActorAccess` on the dedicated routes |
| Author edit-form + traits page | Shipped | `src/routes/views/character-edit-sections.ts:13`, `src/frontend/pages/characters-traits.ts` |
| Player two-tier card / detail modal | Not shipped | no player-side render path emits internal traits |
| Validator coverage for the new fields | Not shipped | no internal-traits branch anywhere in `src/characters/validator/` |
| Export include/exclude of hidden state | Not shipped | `src/characters/exporters/` has no internal-traits mapping |
| Spec-version migration / auto-fill for new fields | Not shipped | `MigrationStatus` exists (`src/characters/spec/enums.ts:57`) but no character-version migration runs |

## Unticketed Gaps

Two divergences from the design have no ticket and no code. First, the **disposition
openness axis** (D2's `open` / `guarded` / `deceptive` / `hidden`) does not exist:
moral disposition ships as numeric `lawful_chaotic` and `good_evil` only
(`services/internal-traits/types.ts`), so "openly evil" versus "secretly evil" cannot
be expressed, and nothing on the read path can distinguish a world-known disposition
from a concealed one. Second, the aspiration visibility value **`hinted`** is a
persisted, validated enum member (`types.ts:23`, route schema `index.ts:23`, page
select `characters-traits.ts:119`) that behaves identically to `hidden` —
`appendAspirations` only ever treats `open` as visible
(`services/internal-traits/prompt-section.ts:25`) — so an author can select it and gets
no distinct hinting behaviour anywhere. Everything else open above is already carried
by `TASK-char-internal-*` tickets; those need no duplicates.

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

> **Runtime note (2026-09-26):** this D9 schema is consumed at runtime by
> `epic-actor-autonomy-story-drive.md` (scheduler + governor + dispatch loop).
> The autonomy epic does not redefine it.

**Integration with aspirations:** A character whose aspiration `priority` is
high and whose autonomy `preference` is "independent" will proactively pursue
their goal even if it means leaving the group. The prompt section emits:
_"This character will pursue their goal of [X] independently. They may leave
the party if the group's direction conflicts with their aim."_

**Integration with coping:** A "withdraw" coper with "loner" autonomy will
physically leave the group when stressed. A "seek_comfort" coper with "social"
autonomy will cling harder. The combination creates distinct behavioral
signatures.

### D10. Voice & speech patterns — how the character talks

Personality defines _who_ the character is. Voice defines _how they speak_.
A "wise, patient" character might speak formally with measured pauses; the
same personality might speak in clipped sentences with dry humor. Voice is
the behavioral signature of speech — the bridge between personality and
dialogue.

Voice is distinct from personality (immutable) and mood (reactive state).
It is the _style_ of expression — the linguistic fingerprint that makes
a character instantly recognizable.

```typescript
interface VoiceProfile {
  // Speech style
  formality: "formal" | "informal" | "mixed";
  verbosity: "terse" | "normal" | "verbose";
  pace: "slow" | "normal" | "fast";
  
  // Linguistic quirks
  accent?: string;              // e.g. "southern", "british", "none"
  dialect?: string;             // e.g. "pirate", "medieval", "modern"
  catchphrases?: string[];      // e.g. ["indeed", "by the gods"]
  verbal_tics?: string[];       // e.g. ["um", "you see", "I reckon"]
  
  // Emotional expression
  emotional_range: "stoic" | "moderate" | "expressive";
  humor_style?: "dry" | "sarcastic" | "playful" | "none";
  
  // Language preferences
  vocabulary_level: "simple" | "moderate" | "advanced" | "archaic";
  sentence_structure: "simple" | "complex" | "mixed";
  
  visibility: TraitVisibility;
}
```

**Prompt integration:** The voice profile is injected into the prompt as a
directive: _"This character speaks formally with a dry wit. They use moderate
vocabulary and prefer complex sentences. They have a catchphrase: 'Indeed.'
Do not have them speak informally or use slang."_

**Integration with mood:** Mood modifies voice expression. A "formal" character
under stress (low happiness) might become curt and terse. A "playful" character
in a serious moment might suppress their humor. The voice profile defines the
baseline; mood defines the deviation.

**Integration with personality:** Voice is the _expression_ of personality.
A "wise" character with "formal" voice speaks differently than a "wise"
character with "informal" voice. Both are wise — but one sounds like a
professor, the other like a sage farmer.

**Anti-collapse directive:** When voice is defined, the prompt must explicitly
enforce it: _"This character has a distinct voice. Do not default to generic
helpful-AI speech patterns. Maintain their voice throughout the conversation."_

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

export interface VoiceProfile {
  formality: "formal" | "informal" | "mixed";
  verbosity: "terse" | "normal" | "verbose";
  pace: "slow" | "normal" | "fast";
  accent?: string;
  dialect?: string;
  catchphrases?: string[];
  verbal_tics?: string[];
  emotional_range: "stoic" | "moderate" | "expressive";
  humor_style?: "dry" | "sarcastic" | "playful" | "none";
  vocabulary_level: "simple" | "moderate" | "advanced" | "archaic";
  sentence_structure: "simple" | "complex" | "mixed";
  visibility: TraitVisibility;
}
```

Storage: extend `CanonicalCharacter` with
`internal_traits?: InternalTrait[]`, `aspirations?: Aspiration[]`,
`moral_disposition?: MoralDisposition`, `coping?: CopingProfile`,
`approach?: ApproachProfile`, `autonomy?: AutonomyProfile`,
`voice?: VoiceProfile`.
Persist hidden state so it is **not** exposed
through `data_json` on player-facing reads — see D1 redaction.

## Prompt Assembly

Design as written below; the shipped shape is marked per bullet (verified 2026-10-09).

- **Shipped** — builder `internalTraitsSection` in
  `src/assistant/prompt/sections/internal-traits.ts`, registered at
  `src/assistant/prompt/registry.ts:55`. Emits `<internal_traits>` wrapping
  `buildPromptSection(actorId, includeHidden)`, which opens with the generic privacy
  line ("track these naturally — do not announce them unless contextually
  appropriate") and appends the visible dimensions.
- Visibility gate: a dimension renders only when its key is in the `visibility` set
  (`aspirations`, `moralDisposition`, `approachTendencies`, `voicePatterns`, or the
  `*` wildcard); aspirations additionally render when a single aspiration is `open`.
- **Shipped** — aspirations with goal/priority/progress; disposition as a ±30
  lawful↔chaotic × good↔evil classification label; approach as decision style + risk
  tolerance + initiative; voice as vocabulary/sentence-structure/humor/verbal tics.
- **Coping (D7) — not shipped:** no coping append in `buildPromptSection`, and no
  mood `happiness ≤ 40` activation. The `coping_mechanisms` column is stored and
  editable but never reaches the prompt.
- **Autonomy (D9) — not shipped as prompt content:** `autonomy_preferences` is read
  only by `src/autonomy/config/resolver.ts` for pacing override; nothing renders
  preference, initiative or separation/reunion triggers into the character prompt.
- **Anti-collapse directives (D4 / D8 / D10) — not shipped:** only the generic
  privacy line exists; there is no per-dimension countermand such as
  "this character's approach is manipulative — do not rationalize it away" or
  "do not default to helpful-AI speech".
- Hidden traits are **not** emitted section-wide: `includeHidden` defaults to `false`
  on the registry path, so hidden aspirations are dropped rather than emitted-but-marked
  (the design's "emitted but marked known-to-the-world" variant did not ship).

## Frontend / UI Visibility

The character edit form is a server-rendered template — `serveCharacterEditForm` in
`src/routes/views/characters.ts:67` delegating to `buildEditFormHtml` in
`src/routes/views/character-edit-form.ts` — plus the `characters.html` grid and
`characters/detail-modal.html`. Verified 2026-10-09: the **author** tier ships (the
collapsible Internal Traits block at `character-edit-sections.ts:13`, and the traits
page at `src/frontend/pages/characters-traits.ts`). The **player** tier does not: no
render path filters hidden state out of the card, grid or detail modal, so tiering is
still author-only-in-practice rather than author-vs-player.

This epic introduces two view tiers (per D6):

1. **Player view** — `characters.html`, `character-edit.html` _read_ mode, and
   `detail-modal.html` render only `visible` traits / `open` disposition /
   `visible` coping/approach/autonomy/voice. Hidden fields are absent — no counts,
   no empty placeholders, no affordance that they exist.
2. **Author/GM view** — the edit form (`serveCharacterEditForm`) gains a
   "hidden from players" badge + visibility toggle per internal trait / aspiration /
   method / coping profile / approach profile / autonomy profile / voice profile,
   and per-disposition openness. Access is role-gated (author/owner/GM only) so
   a player who reaches the editor still cannot read others' hidden state.

The redaction must live in a **shared `toPublicCard()` transform** (per Open Q5) reused
by both the player API read and the player UI render, so the API and the UI can never
drift apart and leak. The transform must handle all 7 hidden dimensions: internal traits,
aspirations, disposition, coping, approach, autonomy, and voice.

## Files

Implemented (verified 2026-10-09):

- `src/db/migrations/001_init.ts:1261` — `character_internal_traits` table (+ index at `:1561`)
- `src/db/schema-core.ts:449` — generated `CharacterInternalTraits` row type
- `src/characters/services/internal-traits/index.ts` — service, 6 profiles, `buildPromptSection`
- `src/characters/services/internal-traits/types.ts` — profile + visibility types
- `src/characters/services/internal-traits/prompt-section.ts` (+ `.test.ts`) — dimension renderers
- `src/assistant/prompt/sections/internal-traits.ts` (+ `.test.ts`) — prompt section
- `src/assistant/prompt/registry.ts:55` — section wiring
- `src/routes/character-internal-traits/index.ts` (+ `index.test.ts`) — `GET` / `PUT` / `DELETE` / `prompt`
- `src/routes/v1/actors-surface.ts:64` — route mount (import at `:20`)
- `src/routes/views/character-edit-sections.ts:13` — collapsible author edit-form block
- `src/routes/views/character-edit-form.ts` — form builder that embeds it
- `src/frontend/pages/characters-traits.ts` (+ `.test.ts`) — author traits page

Planned (do not exist yet):

- `src/characters/spec/internal.ts` — proposed shared type module; the types shipped in the service instead
- `src/characters/to-public-card.ts` (+ `to-public-card.test.ts`) — shared player-facing redaction (D6 / Open Q5)
- `src/assistant/prompt/sections/actor-internal.ts` — superseded by `sections/internal-traits.ts`
- `src/characters/spec/internal.test.ts`, `src/characters/validator-internal.test.ts`,
  `src/routes/characters-internal.test.ts`, `src/characters/integration-internal.test.ts`,
  `src/assistant/prompt/sections/actor-internal.test.ts` — the files named in the
  `## Testing` table below; none of them exist yet
- `src/routes/characters.ts` — superseded by the `src/routes/characters/` directory

## API Surface

- `GET /api/actors/:actorId` — **redacts** hidden internal traits, hidden aspirations,
  `deceptive`/`hidden` disposition openness, hidden coping profiles, hidden approach
  profiles, hidden autonomy profiles, and hidden voice profiles for non-author/GM/owner callers.
- `PUT /api/actors/:actorId` + dedicated endpoints
  (`internal-traits`, `aspirations`, `moral-disposition`, `coping`,
  `approach`, `autonomy`, `voice`) — author/owner/GM only.
- Role enforcement aligned with `epic-character-spec.md` review workflow (Admin/Moderator/
  User/GM). A player must never read another character's hidden state.

## Current-State Verification Required Before Implementation

- Confirm how `data_json` is serialized on read routes (`src/routes/characters/`) to
  place the redaction boundary (do not rely on the DB layer alone).
- Confirm which endpoint feeds the player character card / details / edit render
  (`src/views/characters.html`, `characters/detail-modal.html`, `character-edit.html` →
  `serveCharacterEditForm`) so the shared `toPublicCard()` transform (D6 / Open Q5)
  covers UI renders, not just API reads.
- Confirm prompt-section budget/drop behavior in `prompt-assembler.ts` so the internal
  section is never silently dropped as low-priority (it is behavior-critical).
- Confirm personality `integrity.ts` immutable-list should treat disposition as immutable.
- Confirm coping/approach/autonomy/voice are expression-layer (mutable by GM/event) not
  personality-layer (immutable) — recommend: expression-layer, like mood.
- Confirm mood service exposes happiness threshold for coping activation.
- Confirm relationship service exposes strength data for autonomy/coping integration.
- Confirm voice profile does not conflict with personality traits (e.g. "wise" + "informal" voice).

## Tasks

| Task                          | Description                                                                             | Priority | Status      |
| ----------------------------- | --------------------------------------------------------------------------------------- | -------- | ----------- |
| TASK-char-internal-schema     | Add `InternalTrait`/`Aspiration`/`MoralDisposition`/`CopingProfile`/`ApproachProfile`/`AutonomyProfile`/`VoiceProfile` types + `CanonicalCharacter` fields | High     | Partial — types + sidecar row ship (`services/internal-traits/types.ts`); `CanonicalCharacter` gains no fields (verified 2026-10-09) |
| TASK-char-internal-db         | Migration: internal-traits + aspirations + coping + approach + autonomy + voice tables; `db:sync-types`/`db:sync-manifest`     | High     | Shipped — `character_internal_traits` (`001_init.ts:1261`), generated `schema-core.ts:449` (verified 2026-10-09) |
| TASK-char-internal-validation | Extend `validator/fields.ts` + strict/relaxed modes for new fields                      | High     | Open — no internal-traits branch anywhere in `src/characters/validator/` (verified 2026-10-09) |
| TASK-char-internal-redaction  | Visibility-based redaction on read routes (author/GM/owner vs player)                   | High     | Open — no `toPublicCard()`; only `requireActorAccess` on the dedicated routes (verified 2026-10-09) |
| TASK-char-internal-prompt     | `actorInternalSection` builder + registry wiring + anti-collapse directive + coping/approach/autonomy/voice directives | High     | Partial — `internalTraitsSection` registered (`registry.ts:55`) rendering aspirations/disposition/approach/voice; coping + autonomy rendering and hard anti-collapse directives missing (verified 2026-10-09) |
| TASK-char-internal-api        | CRUD routes for internal-traits / aspirations / moral-disposition / coping / approach / autonomy / voice | Medium   | Shipped — `GET`/`PUT`/`DELETE` + `/prompt` on `/api/character-internal-traits`, owner/admin (verified 2026-10-09) |
| TASK-char-internal-frontend   | Player card + settings redaction via `toPublicCard()`; author/GM editor visibility badge + toggle | High     | Partial — author edit-form section + traits page ship; player card/settings redaction missing (verified 2026-10-09) |
| TASK-char-internal-migration  | Character spec version bump + auto-fill for new fields                                  | Medium   | Open — no character-version migration runs (verified 2026-10-09) |
| TASK-char-internal-export     | Include/exclude hidden state in export formats per visibility                           | Medium   | Open — `src/characters/exporters/` has no internal-traits mapping (verified 2026-10-09) |
| TASK-char-internal-tests      | Schema, validation, redaction, prompt, API tests (all 7 behavioral dimensions)          | High     | Partial — service/section/route/form/page tests exist; redaction + validator coverage absent (verified 2026-10-09) |

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
12. **Voice vs personality conflict** — what happens when voice style contradicts
    personality traits (e.g. "wise" personality + "informal" voice)? Recommend:
    voice wins for expression, personality wins for content.
13. **Voice evolution** — should voice change over time (e.g. character becomes
    more formal after a promotion), or remain immutable author input?
14. **Voice and mood interaction** — how should mood modify voice? Should a
    "formal" character under stress become curt, or maintain formality?

## Testing

| Test File                                              | Coverage                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `src/characters/spec/internal.test.ts`                 | Schema defaults, validation of disposition axes + visibility + coping styles + approach tendencies + autonomy preferences |
| `src/characters/validator-internal.test.ts`            | Strict/relaxed validation of new fields                       |
| `src/routes/characters-internal.test.ts`               | CRUD + redaction (player sees no hidden field; author does)   |
| `src/characters/to-public-card.test.ts`                | `toPublicCard()` redacts hidden traits/aspirations/disposition/coping/approach/autonomy consistently for API + UI renders |
| `src/assistant/prompt/sections/actor-internal.test.ts` | Section emits hidden state + directive; coping triggers on low happiness; approach anti-collapse; autonomy + aspiration integration |
| `src/characters/integration-internal.test.ts`          | create → validate → store → prompt → redacted-read pipeline (all 6 dimensions) |

## Spec Gap

No dedicated spec doc covers D7–D9 (coping, approach, autonomy). `docs/spec/character-spec.md` references them as first-class fields without a schema — this epic IS the spec. Do not invent a `docs/spec/internal-traits.md`; implement here and cite back from character-spec when done.

## Related Epics

- `epic-character-core-system.md` — base character model, personality traits, RPG stats
- `epic-character-spec.md` — unified spec, validation modes, review workflow (role model for redaction roles)
- `epic-agency-story-points.md` — runtime goal progression consumes this epic's aspiration data
- `epic-character-growth.md` — backlink: `toPublicCard()` merge target; growth's `redactForPlayerCard()` folds into this epic's shared redaction once it lands
- `epic-actor-autonomy-story-drive.md` — backlink: D9 autonomy preferences consumed by the autonomy governor at runtime
- `epic-world-diplomacy-karma.md` — karma/reputation (distinct from per-character disposition)
- `epic-social-interaction.md` — deception/intimidation mechanics consume hidden disposition
- `epic-assistant-gm-flows.md` — GM authoring UI for hidden state
- `epic-chat-context-optimization.md` — lossless tiering: hidden state is a lossless system/persona tier
- `epic-wardrobe-avatar-variants.md` — visible/hidden split is also the right encapsulation boundary for wardrobe descriptors (author vs player visibility on outfit metadata); wardrobe consumes character traits/identity for outfit switching triggers

## Task Management Note (2026-08-15)

**Considered:** `task-management` skill (`.opencode/skills/task-management/`) for granular subtask tracking with JSON files in `.tmp/tasks/`.

**Decision:** Use project-native approach instead — `./scripts/worktree.sh ticket TASK "Title" "Description"` for git-issue integration. The skill creates a parallel tracking system (`.tmp/tasks/` JSON) that conflicts with the established `.plan/tickets/` + `git issues` workflow.

**Rationale:** Project already has mature task management via:
- `.plan/tickets/` — ticket files
- `git issues` via `worktree.sh` — distributed, Git-embedded issues
- `.plan/backlog-archive.md` — priority tracking

The task-management skill is better suited for projects without existing task infrastructure.

## Linked Tasks

All ten `TASK-char-internal-*` ticket files still read **Not Started** on disk; the
per-slice code reality is in the Tasks table above (verified 2026-10-09). The three
dependency tickets below moved here from Related Epics.

- `TASK-char-internal-schema.md` (Not Started)
- `TASK-char-internal-db.md` (Not Started)
- `TASK-char-internal-validation.md` (Not Started)
- `TASK-char-internal-redaction.md` (Not Started)
- `TASK-char-internal-prompt.md` (Not Started)
- `TASK-char-internal-api.md` (Not Started)
- `TASK-char-internal-frontend.md` (Not Started)
- `TASK-char-internal-migration.md` (Not Started)
- `TASK-char-internal-export.md` (Not Started)
- `TASK-char-internal-tests.md` (Not Started)
- `TASK-character-mood-happiness.md` (Done) — mood state; coping activates when mood drops
- `TASK-character-relationships.md` (Done) — relationship graph; autonomy + coping reference its strength
- `TASK-character-personality-integrity.md` (Done) — immutable personality; behavioral dimensions are expression, not personality
- `TASK-traits-voice-priority-decision.md` (Not Started) — decide D10 Voice scope vs D1-D9
