// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character ↔ world data boundary (TASK-031).
 *
 * Characters must stay portable across worlds: exporting a character and
 * importing it into another world must carry everything that IS the
 * character and nothing that belongs to a world or a story. Every writable
 * field therefore belongs to one side of a 4-layer split:
 *
 * | Layer         | Side      | Lives in                                             |
 * | ------------- | --------- | ---------------------------------------------------- |
 * | Core          | character | `actors` row (identity, personality card, wardrobe)  |
 * | Equipment     | character | `actor_items` (+ `items` catalog)                    |
 * | World Overlay | world     | `worlds` row, `character_world_traits`, `character_skills`, `character_world_setup`, … |
 * | Story Overlay | world     | `character_stats` transients, `mood_events`, …       |
 *
 * The constants below list request-body keys (camelCase) — the surface the
 * HTTP API actually receives — grouped per layer. Merged per side:
 * `CHARACTER_OWNED_FIELDS` = Core + Equipment, `WORLD_OWNED_FIELDS` =
 * World Overlay + Story Overlay. `assertNoCrossBoundaryWrite` turns the
 * split into an API contract: a character update carrying world-owned keys
 * (or a world update carrying character-owned keys) fails loudly instead of
 * being silently dropped by the field-mapping handlers.
 * @module characters/world-boundary
 */

import type { JsonResult, } from "../utils/safe-json";

// ── Layer field lists (request-body keys) ────────────────────

/**
 * Layer 1 — Core: identity and personality card stored on the `actors` row.
 * Travels with the character across worlds. Keys are the writeable fields of
 * `PUT /api/actors/:actorId` (`buildActorUpdates` + `settings`).
 */
export const CORE_CHARACTER_FIELDS = [
  "displayName",
  "description",
  "systemPrompt",
  "personality",
  "appearance",
  "defaultOutfit",
  "outfits",
  "scenario",
  "welcomeMessage",
  "mesExample",
  "postHistoryInstructions",
  "creatorNotes",
  "creator",
  "characterVersion",
  "contentRating",
  "agentRole",
  "growthMode",
  "llmAssistEnabled",
  "avatarAssetId",
  "settings",
] as const;

/**
 * Layer 2 — Equipment: gear and inventory owned by the character, stored in
 * `actor_items`. Keys are the entity-CRUD field mappings of
 * `/api/actors/:actorId/items`. `name`/`description` collide with world
 * request keys and are therefore treated as shared (see
 * `SHARED_BOUNDARY_FIELDS`).
 */
export const EQUIPMENT_CHARACTER_FIELDS = [
  "name",
  "description",
  "itemType",
  "quantity",
  "value",
  "weight",
  "tags",
  "metadata",
  "equipped",
  "sortOrder",
] as const;

/**
 * Layer 3 — World Overlay: world configuration and per-world character
 * state (skills, karma/standings, world traits, currencies). Keys are the
 * writeable fields of the world config API (`POST`/`PUT /api/worlds`,
 * handler `handleUpdateWorld`). `name`/`description` are shared with the
 * character side.
 */
export const WORLD_OVERLAY_FIELDS = [
  "name",
  "description",
  "lore",
  "locationCount",
  "kind",
  "visibility",
  "scanDepth",
  "tokenBudget",
  "difficultyModifier",
  "difficultyReroll",
  "difficultyState",
  "rpgEnabled",
  "rpgDice",
  "rpgChecks",
  "rpgCombat",
  "rpgXp",
  "rpgLoot",
  "rpgQuests",
] as const;

/**
 * Layer 4 — Story Overlay: per-story transient buffs and temp changes
 * (combat condition/effect state on `character_stats`, mood drift in
 * `mood_events`). Written through the stats/mood/combat APIs, never through
 * the character or world config update routes.
 */
export const STORY_OVERLAY_FIELDS = [
  "tempHp",
  "conditions",
  "activeEffects",
  "characterState",
  "happiness",
  "baseMood",
  "moodStability",
  "expressionModifiers",
  "delta",
  "happinessDelta",
  "moodOverride",
] as const;

// ── Merged per-side ownership ────────────────────────────────

/**
 * Every field the character side owns: Core + Equipment merged. A character
 * update body may only carry these (plus protocol metadata like
 * `dataVersion`); anything world-owned is rejected with 422.
 */
export const CHARACTER_OWNED_FIELDS: readonly string[] = [
  ...CORE_CHARACTER_FIELDS,
  ...EQUIPMENT_CHARACTER_FIELDS,
];

/**
 * Every field the world side owns: World Overlay + Story Overlay merged. A
 * world update body may only carry these; anything character-owned is
 * rejected with 422.
 */
export const WORLD_OWNED_FIELDS: readonly string[] = [
  ...WORLD_OVERLAY_FIELDS,
  ...STORY_OVERLAY_FIELDS,
];

/**
 * Keys that legitimately appear in request bodies on BOTH sides because the
 * same camelCase name maps to a character column and a world/world-item
 * column (`description` on `actors` vs `worlds`; `name` on `actor_items` vs
 * `worlds`). Computed as the intersection of the merged lists so a new
 * collision cannot silently start failing.
 */
export const SHARED_BOUNDARY_FIELDS: readonly string[] = CHARACTER_OWNED_FIELDS.filter(
  (field,) => WORLD_OWNED_FIELDS.includes(field,),
);

// ── Guard ────────────────────────────────────────────────────

/** Which side of the boundary a write is being attempted on. */
export type BoundarySide = "character" | "world";

/**
 * Reject a field set that crosses the character/world boundary.
 *
 * A field violates the boundary when the OTHER side owns it and this side
 * does not (shared keys — see `SHARED_BOUNDARY_FIELDS` — are accepted by
 * both). Unknown fields are ignored: they are not owned by either side, and
 * the route validation schemas decide whether they are acceptable.
 * @param kind - Side the write targets (`"character"` or `"world"`).
 * @param fields - Request-body keys being written.
 * @returns `{ ok: true, value: null }` when the write stays inside the
 * boundary; `{ ok: false, error }` with a message naming every offending
 * field and the API that owns it otherwise. Never throws.
 * @example
 * assertNoCrossBoundaryWrite("character", ["displayName", "lore",])
 * // → { ok: false, error: Error('"lore" is world-owned …') }
 */
export function assertNoCrossBoundaryWrite(
  kind: BoundarySide,
  fields: readonly string[],
): JsonResult<null> {
  const foreignOnly: Record<string, true> = {};
  for (const field of kind === "character" ? WORLD_OWNED_FIELDS : CHARACTER_OWNED_FIELDS) {
    foreignOnly[field] = true;
  }
  for (const field of kind === "character" ? CHARACTER_OWNED_FIELDS : WORLD_OWNED_FIELDS) {
    delete foreignOnly[field];
  }
  const violations = fields.filter((field,) => foreignOnly[field] === true);
  if (violations.length === 0) {
    return { ok: true, value: null, };
  }
  const otherSide: BoundarySide = kind === "character" ? "world" : "character";
  const otherApi = kind === "character" ? "PUT /api/worlds/:worldId" : "PUT /api/actors/:actorId";
  const quoted = violations.map((field,) => `"${field}"`).join(", ",);
  return {
    ok: false,
    error: new Error(
      `Cross-boundary write: ${quoted} ${violations.length === 1 ? "is" : "are"} ` +
        `${otherSide}-owned and cannot be written through the ${kind} update API. ` +
        `Send ${otherSide} fields to ${otherApi} instead.`,
    ),
  };
}
