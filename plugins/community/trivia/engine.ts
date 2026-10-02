// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trivia Engine
 *
 * Question bank, scoring, streak tracking, session management.
 * Question bank is embedded — extensible via config file in future.
 */

import { QUESTIONS } from "./questions";
import type {
  TriviaQuestion,
  TriviaAnswerResult,
  TriviaSession,
  TriviaDifficulty,
  TriviaCategory,
} from "./types";

// ── Constants ─────────────────────────────────────────────────

const STREAK_MULTIPLIER = 0.5;
const BASE_POINTS: Record<TriviaDifficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 30,
};

// ── RNG ───────────────────────────────────────────────────────

function cryptoRandom(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = cryptoRandom(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── ID generation ─────────────────────────────────────────────

function generateId(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");
}

// ── Public API ────────────────────────────────────────────────

/**
 * Get available categories.
 */
export function getCategories(): { id: TriviaCategory; name: string; count: number }[] {
  const counts = new Map<TriviaCategory, number>();
  for (const q of QUESTIONS) {
    counts.set(q.category, (counts.get(q.category) || 0) + 1);
  }
  return [
    { id: "general", name: "General Knowledge", count: counts.get("general") || 0 },
    { id: "science", name: "Science", count: counts.get("science") || 0 },
    { id: "history", name: "History", count: counts.get("history") || 0 },
    { id: "pop_culture", name: "Pop Culture", count: counts.get("pop_culture") || 0 },
    { id: "geography", name: "Geography", count: counts.get("geography") || 0 },
    { id: "technology", name: "Technology", count: counts.get("technology") || 0 },
  ];
}

/**
 * Filter question bank by category and difficulty.
 */
export function filterQuestions(
  category?: TriviaCategory,
  difficulty?: TriviaDifficulty,
): TriviaQuestion[] {
  let filtered = [...QUESTIONS];
  if (category) filtered = filtered.filter(q => q.category === category);
  if (difficulty) filtered = filtered.filter(q => q.difficulty === difficulty);
  return filtered;
}

/**
 * Start a new trivia session.
 *
 * @param category   Optional category filter
 * @param difficulty Optional difficulty filter
 * @param count      Number of questions (default: 5)
 */
export function startSession(
  category?: TriviaCategory,
  difficulty?: TriviaDifficulty,
  count = 5,
): TriviaSession {
  const pool = filterQuestions(category, difficulty);
  if (pool.length === 0) throw new Error("No questions match your filters");

  const selected = shuffleArray(pool).slice(0, Math.min(count, pool.length));

  return {
    id: generateId(),
    questions: selected,
    currentIndex: 0,
    answers: new Array(selected.length).fill(null),
    score: 0,
    streak: 0,
    bestStreak: 0,
    finished: false,
    totalQuestions: selected.length,
  };
}

/**
 * Answer the current question in a session.
 *
 * @param session     The trivia session (mutated)
 * @param answerIndex Index of the chosen answer
 */
export function answerQuestion(
  session: TriviaSession,
  answerIndex: number,
): TriviaAnswerResult {
  if (session.finished) throw new Error("Session is already finished");
  if (session.currentIndex >= session.questions.length) throw new Error("No more questions");

  const question = session.questions[session.currentIndex];
  const correct = answerIndex === question.correctIndex;

  let points = 0;
  if (correct) {
    points = BASE_POINTS[question.difficulty];
    points += Math.floor(points * session.streak * STREAK_MULTIPLIER);
    session.streak++;
    if (session.streak > session.bestStreak) session.bestStreak = session.streak;
  } else {
    session.streak = 0;
  }

  const result: TriviaAnswerResult = {
    correct,
    correctAnswer: question.options[question.correctIndex],
    points,
    explanation: question.explanation,
  };

  session.answers[session.currentIndex] = result;
  session.score += points;
  session.currentIndex++;

  if (session.currentIndex >= session.questions.length) {
    session.finished = true;
  }

  return result;
}

/**
 * Get the current question (without revealing the answer).
 */
export function getCurrentQuestion(session: TriviaSession): Omit<TriviaQuestion, "correctIndex"> | null {
  if (session.finished || session.currentIndex >= session.questions.length) return null;

  const q = session.questions[session.currentIndex];
  const { correctIndex: _, ...safe } = q;
  return safe;
}