// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Patch field specs for the B4 entity commands (`/apply`, `/add`,
 * `/clone`, `/modify`).
 *
 * One grammar, one spec table per kind: the command handlers parse
 * `key=value` pairs (or, for `/modify`, an LLM-proposed JSON object) with the
 * SAME field specs, so what a preview shows is exactly what the HTTP route
 * accepts.
 */
import {
  DifficultyReroll,
  DifficultyState,
  ItemCategory,
  ItemRarity,
  LocationKind,
  MobilityMode,
  WorldKind,
  WorldVisibility,
} from "../../db/enums";
import { type PatchSpec, } from "./entity-patch";

/** `/apply world` — what `handleUpdateWorld` reads from the PUT body. */
export const WORLD_APPLY_SPEC: PatchSpec = {
  name: { type: "string", },
  description: { type: "string", },
  lore: { type: "string", },
  kind: { type: "string", allowedValues: Object.values(WorldKind,), },
  visibility: { type: "string", allowedValues: Object.values(WorldVisibility,), },
  difficultyReroll: { type: "string", allowedValues: Object.values(DifficultyReroll,), },
  difficultyState: { type: "string", allowedValues: Object.values(DifficultyState,), },
  scanDepth: { type: "number", },
  tokenBudget: { type: "number", },
  difficultyModifier: { type: "number", },
};

/** `/apply location` / `/clone location` overrides — what `handleUpdateLocation` reads. */
export const LOCATION_APPLY_SPEC: PatchSpec = {
  name: { type: "string", },
  description: { type: "string", },
  kind: { type: "string", allowedValues: Object.values(LocationKind,), },
  mobilityMode: { type: "string", allowedValues: Object.values(MobilityMode,), },
  parentLocationId: { type: "string", rejectEmpty: true, },
  coordX: { type: "number", },
  coordY: { type: "number", },
  coordZ: { type: "number", },
  connections: { type: "json-array", },
};

/** `/apply item` — what the PUT item-definition route reads from its body. */
export const ITEM_APPLY_SPEC: PatchSpec = {
  name: { type: "string", },
  description: { type: "string", },
  category: { type: "string", allowedValues: Object.values(ItemCategory,), },
  rarity: { type: "string", allowedValues: Object.values(ItemRarity,), },
  value: { type: "number", },
  weight: { type: "number", },
  properties: { type: "json-object", requireEffectsArray: true, },
};

/**
 * `/add location` extras and `/clone location` field overrides — what
 * `handleCreateLocation` reads from the POST body, minus the positional name.
 */
export const LOCATION_ADD_SPEC: PatchSpec = {
  description: { type: "string", },
  kind: { type: "string", allowedValues: Object.values(LocationKind,), },
  mobilityMode: { type: "string", allowedValues: Object.values(MobilityMode,), },
  parentLocationId: { type: "string", rejectEmpty: true, },
  coordX: { type: "number", },
  coordY: { type: "number", },
  coordZ: { type: "number", },
  connections: { type: "json-array", },
};

/**
 * `/add item` extras and `/clone item` field overrides — what the POST
 * item-definitions route reads, minus the positional name. `stackable` and
 * `maxStack` are accepted but `/clone` never copies them from the source row:
 * the route casts `body.stackable` to boolean while the column stores the
 * `StackableState` text enum, so round-tripping the row value is unreliable.
 */
export const ITEM_ADD_SPEC: PatchSpec = {
  description: { type: "string", },
  category: { type: "string", allowedValues: Object.values(ItemCategory,), },
  rarity: { type: "string", allowedValues: Object.values(ItemRarity,), },
  value: { type: "number", },
  weight: { type: "number", },
  maxStack: { type: "number", },
  stackable: { type: "boolean", },
  properties: { type: "json-object", requireEffectsArray: true, },
};

/**
 * `/modify character` — the body fields `buildActorUpdates` reads from the
 * actor PUT route (`src/routes/characters/update.ts`). Only character-owned
 * fields are listed: the route rejects a body carrying world-owned keys
 * (`assertNoCrossBoundaryWrite`).
 */
export const CHARACTER_MODIFY_SPEC: PatchSpec = {
  displayName: { type: "string", },
  description: { type: "string", },
  personality: { type: "string", },
  appearance: { type: "string", },
};
