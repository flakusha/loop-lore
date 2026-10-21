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
    expect(res[0]!.recallAt5,).toBe(1,);
    expect(res[1]!.recallAt5,).toBe(1,);
  });

  test("loads golden-character suite", async () => {
    const goldenCharacter = (await import("./golden/golden-character.json")).default;
    const retrieve = async (q: string,) => q.includes("traits",) ? ["doc-trait-schema",] : ["doc-relationships",];
    const res = await runSuite(goldenCharacter as any, retrieve,);
    expect(res.length,).toBe(2,);
    expect(res.every((r,) => r.recallAt5 === 1),).toBe(true,);
  });
});
