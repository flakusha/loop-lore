import type { Scorer } from "../types";

export const scoreNarrativeQuality: Scorer = ({ response }) => {
  let score = 60;

  const wordCount = response.split(/\s+/).length;

  if (wordCount >= 100 && wordCount <= 400) score += 15;
  else if (wordCount >= 50) score += 8;
  else if (wordCount < 20) score -= 20;

  const sensory = [
    "smell",
    "sound",
    "feel",
    "taste",
    "sight",
    "hear",
    "glimmer",
    "echo",
    "fragrant",
    "cold",
    "warm",
    "dark",
  ];
  const lowerResponse = response.toLowerCase();
  let sensoryCount = 0;
  for (const s of sensory) {
    if (lowerResponse.includes(s)) sensoryCount++;
  }
  score += sensoryCount * 3;

  const dialogueCount = (response.match(/["\u{201C}\u{201D}]/gu) ?? []).length;
  if (dialogueCount >= 2) score += 8;

  const pastVerbs = (response.match(/\b(was|were|had|did|went|said|walked|looked|turned|spoke)\b/gi) ?? [])
    .length;
  const presentVerbs = (response.match(/\b(is|are|has|do|go|say|walk|look|turn|speak)\b/gi) ?? []).length;
  if (pastVerbs > 0 && presentVerbs > 0) {
    const ratio = pastVerbs / (pastVerbs + presentVerbs);
    if (ratio > 0.8 || ratio < 0.2) score += 5;
    else score -= 5;
  }

  return Math.max(10, Math.min(100, score));
};
