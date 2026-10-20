// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export function recallAtK(actual: string[], expected: string[], k: number,): number {
  if (expected.length === 0) { return 1; }

  const top = new Set(actual.slice(0, k,),);
  const hit = expected.filter((e,) => top.has(e,)).length;

  return hit / expected.length;
}

export function mrr(actual: string[], expected: string[],): number {
  const exp = new Set(expected,);
  for (let i = 0; i < actual.length; i++) {
    const item = actual[i];
    if (item !== undefined && exp.has(item,)) { return 1 / (i + 1); }
  }

  return 0;
}

export function ndcgAtK(
  actual: string[],
  grades: Record<string, number>,
  k: number,
): number {
  const dcg = (items: string[],) =>
    items.slice(0, k,).reduce((acc, id, i,) => {
      const g = grades[id] ?? 0;
      return acc + (Math.pow(2, g,) - 1) / Math.log2(i + 2,);
    }, 0,);

  const ideal = Object.entries(grades,)
    .sort((a, b,) => b[1] - a[1])
    .map(([id,],) => id);

  const idcg = dcg(ideal,);
  if (idcg === 0) { return 0; }
  return dcg(actual,) / idcg;
}

export function precisionAtK(actual: string[], expected: string[], k: number,): number {
  const top = actual.slice(0, k,);
  if (top.length === 0) { return 0; }
  const exp = new Set(expected,);
  return top.filter((a,) => exp.has(a,)).length / top.length;
}

export interface Citation {
  id: string;
}

export function citationClickThrough(citations: Citation[], clicks: string[],): number {
  if (citations.length === 0) { return 0; }
  const clicked = new Set(clicks,);
  const hit = citations.filter((c,) => clicked.has(c.id,)).length;
  return hit / citations.length;
}
