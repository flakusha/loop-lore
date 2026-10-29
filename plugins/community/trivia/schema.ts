// SPDX-License-Identifier: Apache-2.0

/**
 * Trivia schemas — the validation layer for the trivia resource.
 *
 * The HTTP routes and the assistant-facing tool both parse through here, so the
 * body shape and the allowed values are checked once, at the boundary, before
 * a session is started or an answer is scored.
 */

import { Type, } from "@sinclair/typebox";
import type { Static, } from "@sinclair/typebox";
import { parseSchema, type ParseResult, } from "../../validation";
import { TRIVIA_CATEGORIES, TRIVIA_DIFFICULTIES, } from "./types";

/** Body of POST /api/trivia/start. */
const StartBody = Type.Object({
  category: Type.Optional(Type.Union(TRIVIA_CATEGORIES.map((category) => Type.Literal(category)))),
  difficulty: Type.Optional(Type.Union(TRIVIA_DIFFICULTIES.map((difficulty) => Type.Literal(difficulty)))),
  questionCount: Type.Optional(Type.Integer({ minimum: 1 })),
});

/** Body of POST /api/trivia/answer. */
const AnswerBody = Type.Object({
  sessionId: Type.String(),
  answerIndex: Type.Number(),
});

/** Resolved input of POST /api/trivia/start — defaults applied. */
type TriviaStartInput = Static<typeof StartBody> & { questionCount: number };

/** Input of POST /api/trivia/answer. */
type TriviaAnswerInput = Static<typeof AnswerBody>;

/** Field-level messages for the start body. */
const START_MESSAGES: Record<string, string> = {
  category: `category must be one of: ${TRIVIA_CATEGORIES.join(", ")}`,
  difficulty: `difficulty must be one of: ${TRIVIA_DIFFICULTIES.join(", ")}`,
  questionCount: "questionCount must be a positive integer",
};

/** Field-level messages for the answer body. */
const ANSWER_MESSAGES: Record<string, string> = {
  sessionId: "sessionId is required",
  answerIndex: "answerIndex is required (number)",
};

/**
 * Parse the body of POST /api/trivia/start.
 *
 * @param body - the raw request body (undefined for an empty body)
 * @returns The resolved input, or the reason it was rejected.
 */
export function parseStartBody(body: unknown): ParseResult<TriviaStartInput> {
  const parsed = parseSchema(StartBody, body ?? {}, START_MESSAGES);
  if (!parsed.ok) {
    return parsed;
  }
  return {
    ok: true,
    value: {
      category: parsed.value.category,
      difficulty: parsed.value.difficulty,
      questionCount: parsed.value.questionCount ?? 5,
    },
  };
}

/**
 * Parse the body of POST /api/trivia/answer.
 *
 * @param body - the raw request body
 * @returns The validated input, or the reason it was rejected.
 */
export function parseAnswerBody(body: unknown): ParseResult<TriviaAnswerInput> {
  return parseSchema(AnswerBody, body, ANSWER_MESSAGES);
}
