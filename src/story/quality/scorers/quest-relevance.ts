import type { Scorer, } from "../types";

export const scoreQuestRelevance: Scorer = ({ response, quests, },) => {
  if (!quests || quests.length === 0) { return 60; }

  let score = 50;
  const responseLower = response.toLowerCase();

  for (const quest of quests) {
    const questWords = quest.name.toLowerCase().split(/\s+/,);
    let matchedCount = 0;
    for (const w of questWords) {
      if (w.length > 3 && responseLower.includes(w,)) { matchedCount++; }
    }
    if (matchedCount > 0) {
      score += 10 + (matchedCount / questWords.length) * 10;
    }
  }

  const progressWords = [
    "found",
    "discovered",
    "defeated",
    "rescued",
    "collected",
    "obtained",
    "acquired",
    "completed",
    "progress",
    "quest",
    "objective",
    "goal",
    "mission",
  ];
  const hasProgress = progressWords.some((w,) => responseLower.includes(w,));
  if (hasProgress) { score += 10; }

  return Math.max(10, Math.min(100, score,),);
};
