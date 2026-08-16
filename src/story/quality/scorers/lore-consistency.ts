// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { extractEntities, } from "../shared";
import type { Scorer, } from "../types";

export const scoreLoreConsistency: Scorer = ({ response, lore, },) => {
  if (!lore) { return 75; }

  let score = 70;

  const loreLower = lore.toLowerCase();
  const responseLower = response.toLowerCase();

  const loreEntities = extractEntities(loreLower,);
  const responseEntities = extractEntities(responseLower,);

  if (loreEntities.size > 0 && responseEntities.size > 0) {
    let matchCount = 0;
    outer: for (const e of responseEntities) {
      for (const le of loreEntities) {
        if (le.includes(e,) || e.includes(le,)) {
          matchCount++;
          continue outer;
        }
      }
    }
    const matchRatio = matchCount / responseEntities.size;
    if (matchRatio > 0.5) { score += 15; }
    else if (matchRatio > 0.2) { score += 8; }
    else if (matchRatio < 0.1 && responseEntities.size > 2) { score -= 15; }
  }

  return Math.max(10, Math.min(100, score,),);
};
