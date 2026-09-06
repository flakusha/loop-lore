// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertBlogPosts, insertUsers, } from "../../../test-utils/insert-helpers";
import { addRAGSource, getRAGSources, } from "./rag";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "author", "Author", { id: "user-author", },);
  await insertBlogPosts(db, "user-author", "Title", "Body", { id: "post-1", },);
},);

describe("blog RAG sources", () => {
  test("addRAGSource persists a row linked to the post", async () => {
    const row = await addRAGSource(db, "post-1", {
      source_type: "external_web",
      uri: "https://example.com/lore",
      title: "Lore",
      relevance_score: 0.8,
      snippet: "dragons",
    },);
    expect(row.post_id,).toBe("post-1",);
    expect(row.uri,).toBe("https://example.com/lore",);
    expect(row.title,).toBe("Lore",);
    expect(row.id.length,).toBeGreaterThan(0,);
    expect(row.created_at.length,).toBeGreaterThan(0,);
    const stored = await db
      .selectFrom("blog_rag_sources",)
      .selectAll()
      .where("id", "=", row.id,)
      .executeTakeFirst();
    expect(stored?.post_id,).toBe("post-1",);
  });

  test("getRAGSources returns rows ordered by relevance descending", async () => {
    await addRAGSource(db, "post-1", {
      source_type: "external_web",
      uri: "https://example.com/low",
      title: "Low",
      relevance_score: 0.1,
      snippet: "low",
    },);
    await addRAGSource(db, "post-1", {
      source_type: "internal_rag",
      uri: "memory://high",
      title: "High",
      relevance_score: 0.9,
      snippet: "high",
    },);
    const rows = await getRAGSources(db, "post-1",);
    expect(rows.map((r,) => r.title),).toEqual(["High", "Low",],);
  });

  test("getRAGSources returns an empty list for a post with no sources", async () => {
    expect(await getRAGSources(db, "post-1",),).toEqual([],);
  });

  test("getRAGSources isolates rows to the requested post", async () => {
    await insertBlogPosts(db, "user-author", "Other", "Body", { id: "post-2", },);
    await addRAGSource(db, "post-1", {
      source_type: "external_web",
      uri: "https://example.com/a",
      title: "A",
      relevance_score: 0.5,
      snippet: "a",
    },);
    await addRAGSource(db, "post-2", {
      source_type: "external_web",
      uri: "https://example.com/b",
      title: "B",
      relevance_score: 0.5,
      snippet: "b",
    },);
    expect((await getRAGSources(db, "post-1",)).map((r,) => r.title),).toEqual(["A",],);
    expect((await getRAGSources(db, "post-2",)).map((r,) => r.title),).toEqual(["B",],);
  });
});
