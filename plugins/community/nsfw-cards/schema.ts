// SPDX-License-Identifier: Apache-2.0

/**
 * NSFW Card Game schemas — the validation layer for the nsfw-cards resource.
 *
 * The HTTP routes and the assistant-facing tool both parse through here, so the
 * body shape, the ranges and the allowed values are checked once, at the
 * boundary, before an encounter is started or a card is played.
 */

import { Type, } from "@sinclair/typebox";
import type { Static, } from "@sinclair/typebox";
import { parseSchema, type ParseResult, } from "../../validation";
import { SEDUCTION_CARD_TYPES, SEDUCTION_DIFFICULTIES, } from "./types";

/** Inclusive bounds of the `handSize` field. */
const HAND_SIZE_RANGE = { minimum: 3, maximum: 7 } as const;

/** Inclusive bounds of the `cardPower` field. */
const CARD_POWER_RANGE = { minimum: 1, maximum: 5 } as const;

/** Body of POST /api/nsfw-cards/start. */
const StartBody = Type.Object({
  difficulty: Type.Optional(Type.Union(SEDUCTION_DIFFICULTIES.map((difficulty) => Type.Literal(difficulty)))),
  handSize: Type.Optional(Type.Integer(HAND_SIZE_RANGE)),
});

/** Body of POST /api/nsfw-cards/play. */
const PlayBody = Type.Object({
  cardIndex: Type.Number(),
  state: Type.Record(Type.String(), Type.Unknown()),
});

/** Body of the `play_seduction_card` tool. */
const ToolBody = Type.Object({
  cardType: Type.Union(SEDUCTION_CARD_TYPES.map((cardType) => Type.Literal(cardType))),
  cardPower: Type.Number(CARD_POWER_RANGE),
});

/** Resolved input of POST /api/nsfw-cards/start — defaults applied. */
type SeductionStartInput = Required<Static<typeof StartBody>>;

/** Input of POST /api/nsfw-cards/play. */
type SeductionPlayInput = Static<typeof PlayBody>;

/** Input of the `play_seduction_card` tool. */
type SeductionToolInput = Static<typeof ToolBody>;

/** Field-level messages for the start body. */
const START_MESSAGES: Record<string, string> = {
  difficulty: `difficulty must be one of: ${SEDUCTION_DIFFICULTIES.join(", ")}`,
  handSize: "handSize must be 3-7",
};

/** Field-level messages for the play body. */
const PLAY_MESSAGES: Record<string, string> = {
  cardIndex: "cardIndex is required (number)",
  state: "state is required — send back from /start or /play",
};

/** Field-level messages for the tool body. */
const TOOL_MESSAGES: Record<string, string> = {
  cardType: `cardType must be one of: ${SEDUCTION_CARD_TYPES.join(", ")}`,
  cardPower: "Card power must be between 1 and 5.",
};

/**
 * Parse the body of POST /api/nsfw-cards/start.
 *
 * @param body - the raw request body (undefined for an empty body)
 * @returns The resolved input, or the reason it was rejected.
 */
export function parseStartBody(body: unknown): ParseResult<SeductionStartInput> {
  const parsed = parseSchema(StartBody, body ?? {}, START_MESSAGES);
  if (!parsed.ok) {
    return parsed;
  }
  return {
    ok: true,
    value: {
      difficulty: parsed.value.difficulty ?? "medium",
      handSize: parsed.value.handSize ?? 5,
    },
  };
}

/**
 * Parse the body of POST /api/nsfw-cards/play.
 *
 * @param body - the raw request body
 * @returns The validated input, or the reason it was rejected.
 */
export function parsePlayBody(body: unknown): ParseResult<SeductionPlayInput> {
  return parseSchema(PlayBody, body, PLAY_MESSAGES);
}

/**
 * Parse the body of the `play_seduction_card` tool.
 *
 * @param body - the raw tool parameters
 * @returns The validated input, or the reason it was rejected.
 */
export function parseToolBody(body: unknown): ParseResult<SeductionToolInput> {
  return parseSchema(ToolBody, body, TOOL_MESSAGES);
}
