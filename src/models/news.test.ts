/**
 * Tests for the model news pipeline (parsers + stubbed poll).
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { latestNews, NEWS_FEEDS, parseFeed, parseHfModels, pollFeed, } from "./news";

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Release notes from llama.cpp</title>
  <updated>2026-10-29T08:14:11Z</updated>
  <entry>
    <id>tag:github.com,2008:Repository/612354784/b11989</id>
    <updated>2026-10-29T08:14:11Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/ggml-org/llama.cpp/releases/tag/b11989"/>
    <title>b11989: sparse attn on CDNA</title>
    <author><name>IMbackK</name></author>
  </entry>
</feed>`;

function stubFetch(body: string,) {
  return async (_url: string,) => new Response(body, { status: 200, },);
}

describe("model news", () => {
  it("parses Atom entries to headline items", () => {
    const items = parseFeed(ATOM,);
    expect(items.length,).toBe(1,);
    expect(items[0]?.title,).toBe("b11989: sparse attn on CDNA",);
    expect(items[0]?.url,).toBe("https://github.com/ggml-org/llama.cpp/releases/tag/b11989",);
    expect(items[0]?.author,).toBe("IMbackK",);
    expect(items[0]?.publishedAt,).toBe("2026-10-29T08:14:11Z",);
  });

  it("parses HF model rows to items", () => {
    const items = parseHfModels(
      JSON.stringify([{ id: "Qwen/Qwen3-8B-GGUF", lastModified: "2026-06-01T00:00:00Z", },],),
    );

    expect(items.length,).toBe(1,);
    expect(items[0]?.url,).toBe("https://huggingface.co/Qwen/Qwen3-8B-GGUF",);
  });

  it("pollFeed stores a snapshot; latestNews reads it back", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const feed = NEWS_FEEDS[0]!;
      const n = await pollFeed(db, feed, stubFetch(ATOM,) as typeof fetch,);
      expect(n,).toBe(1,);
      const families = await latestNews(db,);
      const family = families.find((f,) => f.family === feed.family);
      expect(family?.items.length,).toBe(1,);
      // Unpolled families report empty, never throw.
      expect(families.length,).toBe(NEWS_FEEDS.length,);
    } finally {
      sqlite.close();
    }
  });

  it("failed fetch keeps the previous snapshot", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const feed = NEWS_FEEDS[0]!;
      await pollFeed(db, feed, stubFetch(ATOM,) as typeof fetch,);
      const failing = async (_url: string,) => new Response("boom", { status: 500, },);
      expect(await pollFeed(db, feed, failing as typeof fetch,),).toBe(0,);
      const families = await latestNews(db,);
      expect(families.find((f,) => f.family === feed.family)?.items.length,).toBe(1,);
    } finally {
      sqlite.close();
    }
  });
});
