# Character ↔ World Data Boundary

TASK-031. Every writable field in the API belongs to exactly one side of a
four-layer split between **character data** and **world data**. The split is
enforced at the type level (`src/characters/world-boundary.ts`) and at the
API edge (a 422 guard on the character and world update routes). No schema
migration is involved: every existing field already lives on a row whose
key encodes its scope.

## Rationale: portable characters

A character must be exportable from one world and importable into another
without dragging world-specific state along. Anything that *is* the
character — personality, appearance, gear — travels with it. Anything that
*belongs to a world or a story* — world rules, per-world skills and
standings, story-transient buffs — stays behind. Mixing the two makes
exports lossy or bloated and lets a world's rules bleed into another
world's playthroughs.

## The four layers

| Layer | Side | Concrete storage |
| --- | --- | --- |
| 1. Core | character | `actors` row: identity, personality card, wardrobe (`display_name`, `description`, `system_prompt`, `personality`, `appearance`, `default_outfit`, `outfits`, `scenario`, `mes_example`, `welcome_message`, `post_history_instructions`, `creator_notes`, `creator`, `character_version`, `content_rating`, `agent_role`, `growth_mode`, `llm_assist_enabled`, `avatar_asset_id`, `settings`) |
| 2. Equipment | character | `actor_items` (per-actor inventory; definition catalog in `items`) |
| 3. World Overlay | world | `worlds` row (lore, visibility, scan depth, token budget, difficulty, RPG flags) plus per-(actor, world) tables keyed by `world_id`: `character_world_traits`, `character_world_setup`, `character_skills`, `character_seduction_skills`, `character_relationships`, `actor_currencies` |
| 4. Story Overlay | world | story-transient state: `character_stats` transients (`temp_hp`, `conditions`, `active_effects`, `character_state`), `mood_events` (`happiness`, mood drift) |

Core and Equipment merge into the character-owned field set; World Overlay
and Story Overlay merge into the world-owned field set. The boundary module
exports the four layer constants, the merged `CHARACTER_OWNED_FIELDS` /
`WORLD_OWNED_FIELDS`, and the guard described below.

## Character-owned vs world-owned request fields

The lists use **request-body keys (camelCase)** — the surface clients
actually send — derived from the real write paths:

- Character side (`PUT /api/actors/:actorId` body, plus the
  `/api/actors/:actorId/items` entity CRUD): `displayName`, `description`,
  `systemPrompt`, `personality`, `appearance`, `defaultOutfit`, `outfits`,
  `scenario`, `welcomeMessage`, `mesExample`, `postHistoryInstructions`,
  `creatorNotes`, `creator`, `characterVersion`, `contentRating`,
  `agentRole`, `growthMode`, `llmAssistEnabled`, `avatarAssetId`,
  `settings`, `itemType`, `quantity`, `value`, `weight`, `tags`,
  `metadata`, `equipped`, `sortOrder`, `name`.
- World side (`PUT /api/worlds/:worldId` body, plus stats/mood write keys):
  `lore`, `locationCount`, `kind`, `visibility`, `scanDepth`,
  `tokenBudget`, `difficultyModifier`, `difficultyReroll`,
  `difficultyState`, `rpgEnabled`, `rpgDice`, `rpgChecks`, `rpgCombat`,
  `rpgXp`, `rpgLoot`, `rpgQuests`, `tempHp`, `conditions`,
  `activeEffects`, `characterState`, `happiness`, `baseMood`,
  `moodStability`, `expressionModifiers`, `delta`, `happinessDelta`,
  `moodOverride`.
- **Shared keys** — `description` and `name` — exist on both sides because
  the same camelCase name maps to a character column (`actors.description`,
  `actor_items.name`) and a world column (`worlds.description`,
  `worlds.name`). They are accepted by both APIs and never flagged.
- **Protocol metadata** — `dataVersion` (optimistic concurrency) — is not a
  domain field and is exempt on both sides.

## The 422 guard

`assertNoCrossBoundaryWrite(kind, fields)` in
`src/characters/world-boundary.ts` checks a request's body keys against the
ownership lists. A field violates the boundary when the *other* side owns
it and the target side does not. Unknown fields are ignored (route
validation schemas still govern declared fields).

Both update routes wire the guard in after their authorization checks and
before any write is assembled:

- `PUT /api/actors/:actorId` (`src/routes/characters/update.ts`) rejects
  world-owned fields.
- `PUT /api/worlds/:worldId` (`handleUpdateWorld` in
  `src/routes/worlds/worlds.ts`) rejects character-owned fields.

A violating request gets **HTTP 422** with a message naming every offending
field and the API that owns it, e.g.:

```
Cross-boundary write: "lore" is world-owned and cannot be written through
the character update API. Send world fields to PUT /api/worlds/:worldId
instead.
```

A rejected request changes nothing: the guard runs before the update map is
built, so the stored row is untouched and the optimistic-concurrency
version is not consumed.

For cross-boundary fields to be observable at all, `ActorUpdateBody` and
`WorldUpdateBody` pass unknown keys through (`additionalProperties: true`)
instead of silently stripping them. Handlers still write only their
declared fields, so the only behavior change is misdirected writes now
fail loudly with 422 instead of disappearing.

## Why there is no migration

No field is physically stored on the wrong side. Character-owned fields
live on rows keyed by the actor alone (`actors.id`, `actor_items.actor_id`);
world-owned overlay fields live on rows keyed by `world_id` (or the
`(actor_id, world_id)` pair); the guard carries the split. One deliberate
concession: story-transient combat/mood state (`temp_hp`, `conditions`,
`active_effects`, mood counters) is stored on `character_stats` and
`mood_events` rows that are not story-keyed. There is no story-scoped table
to move them to yet, so they are classified as Story Overlay (world side)
and kept out of the character/world config APIs by the guard; a future
story-scoped store can adopt them without touching character data.
