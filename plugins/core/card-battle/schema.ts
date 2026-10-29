// SPDX-License-Identifier: Apache-2.0

/**
 * Card Battle schemas — the validation layer for the card-battle resource.
 *
 * The HTTP routes and the assistant-facing tool both parse through here, so the
 * body shape, the ranges and the allowed values are checked once, at the
 * boundary, before any battle state is created.
 */

import { Type, } from "@sinclair/typebox";
import type { Static, } from "@sinclair/typebox";
import { parseSchema, type ParseResult, } from "../../validation";
import { COMBAT_ACTIONS, DIFFICULTIES, } from "./types";

/** Inclusive bounds of the `playerHp` field. */
const HP_RANGE = { minimum: 10, maximum: 1000 } as const;

/** Inclusive bounds of the `handSize` field. */
const HAND_SIZE_RANGE = { minimum: 3, maximum: 7 } as const;

/** Body of POST /api/card-battle/start. */
const StartBody = Type.Object({
  playerHp: Type.Optional(Type.Integer(HP_RANGE)),
  difficulty: Type.Optional(Type.Union(DIFFICULTIES.map((difficulty) => Type.Literal(difficulty)))),
  handSize: Type.Optional(Type.Integer(HAND_SIZE_RANGE)),
});

/** Body of POST /api/card-battle/play. */
const PlayBody = Type.Object({
  cardIndex: Type.Number(),
  action: Type.Union(COMBAT_ACTIONS.map((action) => Type.Literal(action))),
  state: Type.Record(Type.String(), Type.Unknown()),
});

/** Resolved input of POST /api/card-battle/start — defaults applied. */
type CardBattleStartInput = Required<Static<typeof StartBody>>;

/** Input of POST /api/card-battle/play. */
type CardBattlePlayInput = Static<typeof PlayBody>;

/** Field-level messages for the start body. */
const START_MESSAGES: Record<string, string> = {
  playerHp: "playerHp must be 10-1000",
  difficulty: `difficulty must be one of: ${DIFFICULTIES.join(", ")}`,
  handSize: "handSize must be 3-7",
};

/** Field-level messages for the play body. */
const PLAY_MESSAGES: Record<string, string> = {
  cardIndex: "cardIndex is required (number)",
  action: `action must be one of: ${COMBAT_ACTIONS.join(", ")}`,
  state: "state is required — send back the state from /start or previous /play",
};

/**
 * Parse the body of POST /api/card-battle/start.
 *
 * @param body - the raw request body (undefined for an empty body)
 * @returns The resolved input, or the reason it was rejected.
 */
export function parseStartBody(body: unknown): ParseResult<CardBattleStartInput> {
  const parsed = parseSchema(StartBody, body ?? {}, START_MESSAGES);
  if (!parsed.ok) {
    return parsed;
  }
  return {
    ok: true,
    value: {
      playerHp: parsed.value.playerHp ?? 100,
      difficulty: parsed.value.difficulty ?? "medium",
      handSize: parsed.value.handSize ?? 5,
    },
  };
}

/**
 * Parse the body of POST /api/card-battle/play.
 *
 * @param body - the raw request body
 * @returns The validated input, or the reason it was rejected.
 */
export function parsePlayBody(body: unknown): ParseResult<CardBattlePlayInput> {
  return parseSchema(PlayBody, body, PLAY_MESSAGES);
}
