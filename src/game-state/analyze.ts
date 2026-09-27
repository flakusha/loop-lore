// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game state diff analysis.
 *
 * Compares the latest persisted game state against the previous one and
 * produces the movement/add/remove diff consumed by the 2D game canvas
 * and re-injected into narration prompts.
 * @module game-state/analyze
 */

import type { Static, } from "@sinclair/typebox";
import {
  GameStateAnalysisSchema,
  GameStateSchema,
} from "../validation/schemas/world-state";

/** Spatial snapshot of the scene (fenced game-state JSON payload). */
export type GameState = Static<typeof GameStateSchema>;
/** Movement/add/remove diff of two consecutive game states. */
export type GameStateAnalysis = Static<typeof GameStateAnalysisSchema>;

type GameStateEntity = GameState["entities"][number];

/**
 * Analyze `state` against `previous`.
 *
 * Entities are matched by `id` (duplicate ids: last wins). When
 * `previous` is null (first state for the chat) the analysis reports
 * every entity as added with no movements. All output arrays are sorted
 * by entityId for deterministic ordering.
 * @param state - latest game state
 * @param previous - prior game state, or null when none exists
 * @returns movements, added and removed entity id lists
 */
export function analyzeGameState(
  state: GameState,
  previous: GameState | null,
): GameStateAnalysis {
  const current = byId(state.entities,);
  const caption = state.caption;

  if (!previous) {
    return {
      movements: [],
      added: [...current.keys(),].sort(),
      removed: [],
      ...(caption !== undefined ? { caption, } : {}),
    };
  }

  const prior = byId(previous.entities,);
  const movements: GameStateAnalysis["movements"] = [];
  const added: string[] = [];

  for (const [id, entity,] of current) {
    const before = prior.get(id,);
    if (!before) {
      added.push(id,);
    } else if (before.x !== entity.x || before.y !== entity.y) {
      movements.push({
        entityId: id,
        from: { x: before.x, y: before.y, },
        to: { x: entity.x, y: entity.y, },
      },);
    }
  }

  const removed: string[] = [];
  for (const id of prior.keys()) {
    if (!current.has(id,)) { removed.push(id,); }
  }

  return {
    movements: movements.sort((a, b,) => a.entityId.localeCompare(b.entityId,)),
    added: added.sort((a, b,) => a.localeCompare(b,)),
    removed: removed.sort((a, b,) => a.localeCompare(b,)),
    ...(caption !== undefined ? { caption, } : {}),
  };
}

/**
 * Build an id-keyed entity map; duplicate ids: last wins.
 * @param entities - entities to index
 * @returns map from entity id to entity
 */
function byId(entities: GameStateEntity[],): Map<string, GameStateEntity> {
  const map = new Map<string, GameStateEntity>();
  for (const entity of entities) { map.set(entity.id, entity,); }
  return map;
}
