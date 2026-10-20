// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { GoldenSuite, } from "./golden/types";
import { mrr, recallAtK, } from "./metrics";

export interface RunResult {
  queryId: string;
  recallAt5: number;
  mrr: number;
}

export type Retriever = (query: string,) => Promise<string[]>;

export async function runSuite(
  suite: GoldenSuite,
  retrieve: Retriever,
  k = 5,
): Promise<RunResult[]> {
  const out: RunResult[] = [];
  for (const q of suite.queries) {
    const actual = await retrieve(q.query,);
    out.push({
      queryId: q.id,
      recallAt5: recallAtK(actual, q.expectedDocIds, k,),
      mrr: mrr(actual, q.expectedDocIds,),
    },);
  }

  return out;
}
