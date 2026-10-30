// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for weight-change confirmation (parse + stubbed confirm)
 * and news triage state. No network.
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { dismissedNewsIds, triageNewsItem, } from "./news-triage";
import { confirmWeightChange, parseHfCommits, parseHfTree, } from "./weight-confirm";

function stubFetch(routes: Record<string, unknown>,) {
  return async (url: string,) => {
    for (const [prefix, body,] of Object.entries(routes,)) {
      if (url.startsWith(prefix,)) { return new Response(JSON.stringify(body,), { status: 200, },); }
    }

    return new Response("not found", { status: 404, },);
  };
}

describe("weight-change confirmation", () => {
  it("parses commits and tree rows, skipping garbage", () => {
    expect(parseHfCommits([{ id: "abc", title: "t", date: "2026-10-26T00:00:00Z", }, null,],).length,).toBe(1,);
    expect(parseHfTree([{ type: "file", path: "m.gguf", oid: "o", }, { nope: 1, },],).length,).toBe(1,);
    expect(parseHfCommits(null,),).toEqual([],);
  });

  it("confirms true when the head tree carries .gguf files", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const fetchImpl = stubFetch({
        "https://huggingface.co/api/models/org/m/commits": [{
          id: "abc",
          title: "re-release",
          date: "2026-10-26T00:00:00Z",
        },],
        "https://huggingface.co/api/models/org/m/tree": [{ type: "file", path: "model.gguf", oid: "o", },],
        "https://huggingface.co/api/models/org/m": { sha: "abc", },
      },);

      expect(await confirmWeightChange(db, "org/m", fetchImpl as typeof fetch,),).toBe(true,);
    } finally {
      sqlite.close();
    }
  });

  it("confirms false on README-only heads and failed fetches", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const readmeOnly = stubFetch({
        "https://huggingface.co/api/models/org/m/commits": [{
          id: "abc",
          title: "Update README",
          date: "2026-10-26T00:00:00Z",
        },],
        "https://huggingface.co/api/models/org/m/tree": [{ type: "file", path: "README.md", oid: "o", },],
        "https://huggingface.co/api/models/org/m": { sha: "abc", },
      },);

      expect(await confirmWeightChange(db, "org/m", readmeOnly as typeof fetch,),).toBe(false,);
      const failing = async (_url: string,) => new Response("boom", { status: 500, },);
      expect(await confirmWeightChange(db, "org/m", failing as typeof fetch,),).toBe(false,);
    } finally {
      sqlite.close();
    }
  });
});

describe("news triage", () => {
  it("dismiss and un-dismiss round-trips through the snapshot", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      expect((await dismissedNewsIds(db,)).size,).toBe(0,);
      await triageNewsItem(db, "item-1", true,);
      expect(await dismissedNewsIds(db,),).toContain("item-1",);
      await triageNewsItem(db, "item-1", false,);
      expect((await dismissedNewsIds(db,)).size,).toBe(0,);
    } finally {
      sqlite.close();
    }
  });
});
