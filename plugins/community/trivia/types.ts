/**
 * Trivia Types
 */

/** Difficulty levels */
export type TriviaDifficulty = "easy" | "medium" | "hard";

/** Question category */
export type TriviaCategory = "general" | "science" | "history" | "pop_culture" | "geography" | "technology";

/** A trivia question */
export interface TriviaQuestion {
  /** Unique question ID */
  id: string;
  /** Question text */
  question: string;
  /** Array of answer options */
  options: string[];
  /** Index of correct answer */
  correctIndex: number;
  /** Category */
  category: TriviaCategory;
  /** Difficulty */
  difficulty: TriviaDifficulty;
  /** Optional hint */
  hint?: string;
  /** Optional explanation shown after answering */
  explanation?: string;
}

/** Result of answering a question */
export interface TriviaAnswerResult {
  /** Whether the answer was correct */
  correct: boolean;
  /** The correct answer text */
  correctAnswer: string;
  /** Points earned */
  points: number;
  /** Fun fact or explanation */
  explanation?: string;
}

/** Full trivia session state */
export interface TriviaSession {
  /** Session ID */
  id: string;
  /** Questions in the session */
  questions: TriviaQuestion[];
  /** Current question index */
  currentIndex: number;
  /** Player's answers so far */
  answers: (TriviaAnswerResult | null)[];
  /** Total score */
  score: number;
  /** Current streak */
  streak: number;
  /** Best streak */
  bestStreak: number;
  /** Whether session is complete */
  finished: boolean;
  /** Questions per session */
  totalQuestions: number;
}

/** API request to start a trivia session */
export interface TriviaStartRequest {
  /** Category filter */
  category?: TriviaCategory;
  /** Difficulty */
  difficulty?: TriviaDifficulty;
  /** Number of questions (default: 5) */
  questionCount?: number;
}

/** API request to answer a question */
export interface TriviaAnswerRequest {
  /** Session ID */
  sessionId: string;
  /** Index of chosen answer */
  answerIndex: number;
}