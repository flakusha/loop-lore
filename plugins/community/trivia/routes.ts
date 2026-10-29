// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trivia Routes — POST /api/trivia/start, POST /api/trivia/answer, GET /api/trivia/categories
 */

import { startSession, answerQuestion, getCurrentQuestion, getCategories } from "./engine";
import { jsonResponse, jsonError, HttpStatus } from "../../../src/routes/http-utils";
import { readJsonBody } from "../../validation";
import { parseAnswerBody, parseStartBody } from "./schema";
import { TRIVIA_DIFFICULTIES } from "./types";
import type { TriviaQuestion, TriviaSession } from "./types";

/**
 * Validate an answer index against the question on screen.
 *
 * @returns The error message for an unanswerable index, null when the index is fine.
 */
function validateAnswerIndex(
  answerIndex: number,
  question: Omit<TriviaQuestion, "correctIndex"> | null,
): string | null {
  if (!Number.isInteger(answerIndex)) return "answerIndex must be an integer";
  if (question && (answerIndex < 0 || answerIndex >= question.options.length)) {
    return `answerIndex must be between 0 and ${question.options.length - 1}`;
  }
  return null;
}

// In-memory session store (per-process, no persistence — game sessions are ephemeral)
const sessions = new Map<string, TriviaSession>();

const MAX_SESSIONS = 100;
/** Cleanup stale sessions */
function gcSessions(): void {
  // Simple LRU — drop oldest when over limit
  if (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest) sessions.delete(oldest);
  }
}

/**
 * Handle POST /api/trivia/start
 *
 * Body: { category?, difficulty?, questionCount? }
 */
export async function handleStart(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/trivia/start" || request.method !== "POST") return null;

  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonError(body.error, HttpStatus.BadRequest);
  }

  const input = parseStartBody(body.value);
  if (!input.ok) {
    return jsonError(input.error, HttpStatus.BadRequest);
  }

  try {
    gcSessions();
    const session = startSession(input.value.category, input.value.difficulty, input.value.questionCount);
    sessions.set(session.id, session);

    const current = getCurrentQuestion(session);
    return jsonResponse({
      sessionId: session.id,
      totalQuestions: session.totalQuestions,
      currentQuestion: current,
      score: 0,
      streak: 0,
    });
  } catch (error) {
    return jsonError((error as Error).message, HttpStatus.BadRequest);
  }
}

/**
 * Handle POST /api/trivia/answer
 *
 * Body: { sessionId: string, answerIndex: number }
 */
export async function handleAnswer(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/trivia/answer" || request.method !== "POST") return null;

  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonError(body.error, HttpStatus.BadRequest);
  }

  const input = parseAnswerBody(body.value);
  if (!input.ok) {
    return jsonError(input.error, HttpStatus.BadRequest);
  }

  const session = sessions.get(input.value.sessionId);
  if (!session) {
    return jsonError("Session not found or expired", HttpStatus.NotFound);
  }

  const indexError = validateAnswerIndex(input.value.answerIndex, getCurrentQuestion(session));
  if (indexError) {
    return jsonError(indexError, HttpStatus.BadRequest);
  }

  try {
    const result = answerQuestion(session, input.value.answerIndex);
    const nextQuestion = getCurrentQuestion(session);

    if (session.finished) {
      sessions.delete(session.id);
    }

    return jsonResponse({
      result,
      score: session.score,
      streak: session.streak,
      bestStreak: session.bestStreak,
      questionsRemaining: session.totalQuestions - session.currentIndex,
      finished: session.finished,
      nextQuestion,
    });
  } catch (error) {
    return jsonError((error as Error).message, HttpStatus.BadRequest);
  }
}

/**
 * Handle GET /api/trivia/categories
 */
export async function handleCategories(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/trivia/categories" || request.method !== "GET") return null;

  return jsonResponse({
    categories: getCategories(),
    difficulties: [...TRIVIA_DIFFICULTIES],
  });
}