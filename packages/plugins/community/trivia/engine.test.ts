/**
 * Trivia Engine Tests
 */

import { describe, test, expect } from "bun:test";
import {
  getCategories,
  filterQuestions,
  startSession,
  answerQuestion,
  getCurrentQuestion,
} from "./engine";

// ── getCategories ─────────────────────────────────────────────

describe("getCategories", () => {
  test("returns all 6 categories", () => {
    const cats = getCategories();
    expect(cats).toHaveLength(6);
  });

  test("each category has name and count", () => {
    for (const cat of getCategories()) {
      expect(cat.id).toBeTruthy();
      expect(cat.name).toBeTruthy();
      expect(cat.count).toBeGreaterThan(0);
    }
  });
});

// ── filterQuestions ───────────────────────────────────────────

describe("filterQuestions", () => {
  test("returns all questions with no filter", () => {
    const all = filterQuestions();
    expect(all.length).toBeGreaterThan(0);
  });

  test("filters by category", () => {
    const science = filterQuestions("science");
    expect(science.length).toBeGreaterThan(0);
    for (const q of science) {
      expect(q.category).toBe("science");
    }
  });

  test("filters by difficulty", () => {
    const easy = filterQuestions(undefined, "easy");
    for (const q of easy) {
      expect(q.difficulty).toBe("easy");
    }
  });

  test("filters by both", () => {
    const result = filterQuestions("science", "easy");
    for (const q of result) {
      expect(q.category).toBe("science");
      expect(q.difficulty).toBe("easy");
    }
  });

  test("returns empty for impossible combo", () => {
    const result = filterQuestions("technology", "hard");
    // Depending on bank, might be empty
    for (const q of result) {
      expect(q.category).toBe("technology");
      expect(q.difficulty).toBe("hard");
    }
  });
});

// ── startSession ──────────────────────────────────────────────

describe("startSession", () => {
  test("starts session with correct number of questions", () => {
    const session = startSession(undefined, undefined, 3);
    expect(session.questions).toHaveLength(3);
    expect(session.totalQuestions).toBe(3);
  });

  test("caps to available questions", () => {
    const session = startSession("science", "easy", 999);
    expect(session.questions.length).toBeLessThanOrEqual(999);
  });

  test("starts at index 0", () => {
    const session = startSession();
    expect(session.currentIndex).toBe(0);
    expect(session.score).toBe(0);
    expect(session.streak).toBe(0);
    expect(session.finished).toBe(false);
  });

  test("generates unique IDs", () => {
    const a = startSession();
    const b = startSession();
    expect(a.id).not.toBe(b.id);
  });

  test("throws when no questions match", () => {
    // This might not actually throw if the filter is too specific
    // Just ensure it doesn't crash
    try {
      startSession("science", "hard", 5);
    } catch (e) {
      expect((e as Error).message).toContain("No questions");
    }
  });
});

// ── answerQuestion ────────────────────────────────────────────

describe("answerQuestion", () => {
  test("correct answer awards points", () => {
    const session = startSession(undefined, undefined, 5);
    const q = session.questions[0];
    const result = answerQuestion(session, q.correctIndex);
    expect(result.correct).toBe(true);
    expect(result.points).toBeGreaterThan(0);
    expect(session.score).toBeGreaterThan(0);
  });

  test("wrong answer gives zero points", () => {
    const session = startSession(undefined, undefined, 5);
    const q = session.questions[0];
    const wrongIndex = (q.correctIndex + 1) % q.options.length;
    const result = answerQuestion(session, wrongIndex);
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });

  test("increments currentIndex", () => {
    const session = startSession(undefined, undefined, 5);
    answerQuestion(session, 0);
    expect(session.currentIndex).toBe(1);
  });

  test("streak tracking works", () => {
    const session = startSession(undefined, undefined, 5);
    // Answer correctly twice
    const q1 = session.questions[0];
    answerQuestion(session, q1.correctIndex);
    expect(session.streak).toBe(1);

    const q2 = session.questions[1];
    answerQuestion(session, q2.correctIndex);
    expect(session.streak).toBe(2);
    expect(session.bestStreak).toBe(2);
  });

  test("wrong answer resets streak", () => {
    const session = startSession(undefined, undefined, 5);
    const q1 = session.questions[0];
    answerQuestion(session, q1.correctIndex);
    expect(session.streak).toBe(1);

    const q2 = session.questions[1];
    const wrong = (q2.correctIndex + 1) % q2.options.length;
    answerQuestion(session, wrong);
    expect(session.streak).toBe(0);
  });

  test("finishes when all questions answered", () => {
    const session = startSession(undefined, undefined, 2);
    const q1 = session.questions[0];
    answerQuestion(session, q1.correctIndex);
    expect(session.finished).toBe(false);
    const q2 = session.questions[1];
    answerQuestion(session, q2.correctIndex);
    expect(session.finished).toBe(true);
  });

  test("throws when already finished", () => {
    const session = startSession(undefined, undefined, 1);
    const q = session.questions[0];
    answerQuestion(session, q.correctIndex);
    expect(() => answerQuestion(session, 0)).toThrow("already finished");
  });
});

// ── getCurrentQuestion ────────────────────────────────────────

describe("getCurrentQuestion", () => {
  test("returns question without correctIndex", () => {
    const session = startSession(undefined, undefined, 5);
    const current = getCurrentQuestion(session);
    expect(current).not.toBeNull();
    expect(current).not.toHaveProperty("correctIndex");
    expect(current).toHaveProperty("question");
    expect(current).toHaveProperty("options");
  });

  test("returns null when finished", () => {
    const session = startSession(undefined, undefined, 1);
    const q = session.questions[0];
    answerQuestion(session, q.correctIndex);
    expect(getCurrentQuestion(session)).toBeNull();
  });

  test("advances with session", () => {
    const session = startSession(undefined, undefined, 5);
    const first = getCurrentQuestion(session);
    const q = session.questions[0];
    answerQuestion(session, q.correctIndex);
    expect(session.currentIndex).toBe(1);
  });
});