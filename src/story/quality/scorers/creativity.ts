import type { Scorer } from "../types";
import { calculateSimilarity } from "../shared";

export const scoreCreativity: Scorer = ({ response, recentTurns }) => {
  let score = 65;

  const lowerResponse = response.toLowerCase();

  const evocativeWords = [
    "unexpected",
    "surprising",
    "peculiar",
    "strange",
    "mysterious",
    "unsettling",
    "beautiful",
    "terrifying",
    "ancient",
    "forgotten",
    "glimmer",
    "shadow",
    "whisper",
    "fade",
    "emerge",
  ];
  let evocativeCount = 0;
  for (const w of evocativeWords) {
    if (lowerResponse.includes(w)) evocativeCount++;
  }
  score += evocativeCount * 5;

  if (recentTurns && recentTurns.length > 0) {
    const lastResponses: string[] = [];
    for (const t of recentTurns) {
      const r = t.response ?? "";
      if (r.length > 50) lastResponses.push(r);
    }

    for (const last of lastResponses) {
      const similarity = calculateSimilarity(response, last);
      if (similarity > 0.7) score -= 20;
      else if (similarity > 0.5) score -= 10;
    }
  }

  const cliches = [
    "it was a dark and stormy night",
    "little did they know",
    "the answer was inside them all along",
    "it was all a dream",
    "in the nick of time",
    "destiny called",
  ];
  for (const cliche of cliches) {
    if (lowerResponse.includes(cliche)) score -= 15;
  }

  return Math.max(10, Math.min(100, score));
};
