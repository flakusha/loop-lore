// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Scorer, } from "../types";

export const scoreCharacterVoice: Scorer = ({ response, },) => {
  let score = 70;

  const lowerResponse = response.toLowerCase();

  const hasDialogue = response.includes(`"`,) || response.includes(`'`,);
  const hasAction = /\*.*\*/.test(response,);
  const hasFirstPerson = /\b(I|me|my|mine|myself)\b/i.test(response,);

  if (hasDialogue) { score += 10; }
  if (hasAction) { score += 5; }
  if (hasFirstPerson) { score += 5; }

  const generic = ["in a voice", "in a tone", "he said", "she said", "they said",];
  for (const phrase of generic) {
    if (lowerResponse.includes(phrase,)) { score -= 3; }
  }

  const wordCount = response.split(/\s+/,).length;
  if (wordCount < 15) { score -= 15; }
  if (wordCount > 500) { score -= 5; }

  return Math.max(10, Math.min(100, score,),);
};
