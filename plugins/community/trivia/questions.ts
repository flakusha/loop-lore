// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trivia question bank.
 */

import type { TriviaQuestion } from "./types";

// ── Question Bank ─────────────────────────────────────────────

export const QUESTIONS: TriviaQuestion[] = [
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
