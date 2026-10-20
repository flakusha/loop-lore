// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import goldenText from "./golden/golden-text.json";
import { runSuite, } from "./runner";

describe("runSuite", () => {
  test("computes recall and mrr", async () => {
    const retrieve = async (q: string,) => (q.includes("key",) ? ["doc-key-rotation",] : ["doc-chat-variants",]);
    const res = await runSuite(goldenText as any, retrieve,);
    expect(res.length,).toBe(2,);
    expect(res[0].recallAt5,).toBe(1,);
    expect(res[1].recallAt5,).toBe(1,);
  });
});
