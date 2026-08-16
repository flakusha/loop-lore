// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trivia Routes — POST /api/trivia/start, POST /api/trivia/answer, GET /api/trivia/categories
 */

import { startSession, answerQuestion, getCurrentQuestion, getCategories } from "./engine";
import { jsonResponse, jsonError, HttpStatus } from "../../../src/routes/http-utils";

// In-memory session store (per-process, no persistence — game sessions are ephemeral)
const sessions = new Map<string, import("./types").TriviaSession>();

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

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch { /* empty body ok */ }

  const category = typeof body.category === "string" ? body.category : undefined;
  const difficulty = typeof body.difficulty === "string" ? body.difficulty : undefined;
  const questionCount = typeof body.questionCount === "number" ? body.questionCount : 5;

  try {
    gcSessions();
    const session = startSession(
      category as import("./types").TriviaCategory | undefined,
      difficulty as import("./types").TriviaDifficulty | undefined,
      questionCount,
    );
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON body", HttpStatus.BadRequest);
  }

  if (typeof body.sessionId !== "string") {
    return jsonError("sessionId is required", HttpStatus.BadRequest);
  }
  if (typeof body.answerIndex !== "number") {
    return jsonError("answerIndex is required (number)", HttpStatus.BadRequest);
  }

  const session = sessions.get(body.sessionId);
  if (!session) {
    return jsonError("Session not found or expired", HttpStatus.NotFound);
  }

  try {
    const result = answerQuestion(session, body.answerIndex);
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
    difficulties: ["easy", "medium", "hard"],
  });
}