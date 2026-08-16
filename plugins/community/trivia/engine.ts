// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trivia Engine
 *
 * Question bank, scoring, streak tracking, session management.
 * Question bank is embedded — extensible via config file in future.
 */

import type {
  TriviaQuestion,
  TriviaAnswerResult,
  TriviaSession,
  TriviaDifficulty,
  TriviaCategory,
} from "./types";

// ── Question Bank ─────────────────────────────────────────────

const QUESTIONS: TriviaQuestion[] = [
  // General
  {
    id: "gen-001",
    question: "What is the largest planet in our solar system?",
    options: ["Mars", "Jupiter", "Saturn", "Neptune"],
    correctIndex: 1,
    category: "general",
    difficulty: "easy",
    explanation: "Jupiter is the largest planet, with a mass more than twice that of all other planets combined.",
  },
  {
    id: "gen-002",
    question: "How many continents are there on Earth?",
    options: ["5", "6", "7", "8"],
    correctIndex: 2,
    category: "general",
    difficulty: "easy",
  },
  {
    id: "gen-003",
    question: "What is the smallest country in the world by area?",
    options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"],
    correctIndex: 1,
    category: "general",
    difficulty: "medium",
  },
  // Science
  {
    id: "sci-001",
    question: "What is the chemical symbol for gold?",
    options: ["Go", "Gd", "Au", "Ag"],
    correctIndex: 2,
    category: "science",
    difficulty: "easy",
    explanation: "Au comes from the Latin word 'aurum', meaning gold.",
  },
  {
    id: "sci-002",
    question: "What is the speed of light in vacuum (approximate)?",
    options: ["300,000 km/s", "150,000 km/s", "300,000 m/s", "3,000,000 km/s"],
    correctIndex: 0,
    category: "science",
    difficulty: "medium",
  },
  {
    id: "sci-003",
    question: "What is the hardest natural substance on Earth?",
    options: ["Titanium", "Diamond", "Quartz", "Tungsten"],
    correctIndex: 1,
    category: "science",
    difficulty: "easy",
  },
  {
    id: "sci-004",
    question: "Which element has the atomic number 1?",
    options: ["Helium", "Lithium", "Hydrogen", "Carbon"],
    correctIndex: 2,
    category: "science",
    difficulty: "easy",
  },
  // History
  {
    id: "hist-001",
    question: "In which year did World War II end?",
    options: ["1943", "1944", "1945", "1946"],
    correctIndex: 2,
    category: "history",
    difficulty: "easy",
    explanation: "WWII ended in 1945 with Japan's surrender in September.",
  },
  {
    id: "hist-002",
    question: "Who was the first person to walk on the Moon?",
    options: ["Buzz Aldrin", "Neil Armstrong", "Yuri Gagarin", "John Glenn"],
    correctIndex: 1,
    category: "history",
    difficulty: "easy",
  },
  {
    id: "hist-003",
    question: "The ancient city of Constantinople is now known as?",
    options: ["Athens", "Rome", "Istanbul", "Cairo"],
    correctIndex: 2,
    category: "history",
    difficulty: "medium",
  },
  // Pop Culture
  {
    id: "pop-001",
    question: "Which band performed 'Bohemian Rhapsody'?",
    options: ["The Beatles", "Led Zeppelin", "Queen", "Pink Floyd"],
    correctIndex: 2,
    category: "pop_culture",
    difficulty: "easy",
  },
  {
    id: "pop-002",
    question: "What fictional metal is Captain America's shield made of?",
    options: ["Adamantium", "Vibranium", "Uru", "Carbonadium"],
    correctIndex: 1,
    category: "pop_culture",
    difficulty: "medium",
  },
  {
    id: "pop-003",
    question: "In what year was the first 'Star Wars' movie released?",
    options: ["1975", "1977", "1979", "1980"],
    correctIndex: 1,
    category: "pop_culture",
    difficulty: "easy",
  },
  // Geography
  {
    id: "geo-001",
    question: "What is the longest river in the world?",
    options: ["Amazon", "Nile", "Yangtze", "Mississippi"],
    correctIndex: 1,
    category: "geography",
    difficulty: "medium",
    explanation: "The Nile is approximately 6,650 km long, though some measurements put the Amazon slightly longer.",
  },
  {
    id: "geo-002",
    question: "Which country has the most time zones?",
    options: ["Russia", "USA", "France", "China"],
    correctIndex: 2,
    category: "geography",
    difficulty: "hard",
    explanation: "France has 12 time zones due to its overseas territories.",
  },
  {
    id: "geo-003",
    question: "What is the capital of Australia?",
    options: ["Sydney", "Melbourne", "Canberra", "Brisbane"],
    correctIndex: 2,
    category: "geography",
    difficulty: "medium",
  },
  // Technology
  {
    id: "tech-001",
    question: "What does 'HTML' stand for?",
    options: ["HyperText Markup Language", "High Tech Modern Language", "Hyper Transfer Markup Language", "Home Tool Markup Language"],
    correctIndex: 0,
    category: "technology",
    difficulty: "easy",
  },
  {
    id: "tech-002",
    question: "Who is considered the father of computer science?",
    options: ["Charles Babbage", "Alan Turing", "John von Neumann", "Ada Lovelace"],
    correctIndex: 1,
    category: "technology",
    difficulty: "medium",
  },
  {
    id: "tech-003",
    question: "What year was the first iPhone released?",
    options: ["2005", "2006", "2007", "2008"],
    correctIndex: 2,
    category: "technology",
    difficulty: "easy",
  },
  {
    id: "tech-004",
    question: "What programming language was created by Brendan Eich in 10 days?",
    options: ["Python", "Java", "JavaScript", "Ruby"],
    correctIndex: 2,
    category: "technology",
    difficulty: "medium",
    explanation: "JavaScript was created by Brendan Eich in 1995 while working at Netscape.",
  },
];

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