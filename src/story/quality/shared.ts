// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * @param text
 */
export function extractEntities(text: string,): Set<string> {
  const entities = new Set<string>();
  const capitalizedPattern = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3}\b/g;
  const matches = text.match(capitalizedPattern,);
  if (matches) {
    for (const match of matches) {
      if (
        ![
          "The",
          "A",
          "An",
          "This",
          "That",
          "These",
          "Those",
          "It",
          "He",
          "She",
          "They",
          "We",
          "You",
          "I",
        ].includes(match,)
      ) {
        entities.add(match.toLowerCase(),);
      }
    }
  }
  return entities;
}

/**
 * @param a
 * @param b
 */
export function calculateSimilarity(a: string, b: string,): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/,),);
  const wordsB = new Set(b.toLowerCase().split(/\s+/,),);
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w,)) { intersection++; }
  }
  let unionSize = wordsA.size;
  for (const w of wordsB) {
    if (!wordsA.has(w,)) { unionSize++; }
  }
  return unionSize > 0 ? intersection / unionSize : 0;
}
