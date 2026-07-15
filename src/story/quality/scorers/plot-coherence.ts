import type { Scorer } from "../types";

export const scorePlotCoherence: Scorer = ({ response, prompt }) => {
  let score = 65;

  const lowerResponse = response.toLowerCase();
  const lowerPrompt = prompt.toLowerCase();

  const promptWords = new Set<string>();
  for (const w of lowerPrompt.split(/\s+/)) {
    if (w.length > 3) promptWords.add(w);
  }
  const responseWords = lowerResponse.split(/\s+/);
  let matchedWordCount = 0;
  for (const w of responseWords) {
    if (promptWords.has(w)) matchedWordCount++;
  }

  const overlapRatio = matchedWordCount / (promptWords.size || 1);
  if (overlapRatio > 0.3) score += 15;
  else if (overlapRatio > 0.1) score += 5;

  const contradictionPhrases = [
    "but suddenly",
    "however",
    "on the other hand",
    "contrary to",
    "despite this",
  ];
  for (const phrase of contradictionPhrases) {
    if (lowerResponse.includes(phrase)) score -= 2;
  }

  const flowMarkers = [
    "because",
    "since",
    "as a result",
    "therefore",
    "this causes",
    "leading to",
    "in response",
  ];
  let hasFlow = false;
  for (const m of flowMarkers) {
    if (lowerResponse.includes(m)) {
      hasFlow = true;
      break;
    }
  }
  if (hasFlow) score += 10;

  return Math.max(10, Math.min(100, score));
};
