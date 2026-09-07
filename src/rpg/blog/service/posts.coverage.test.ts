// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertUsers, } from "../../../test-utils/insert-helpers";
import { follow, } from "./follows";
import { BlogService, } from "./index";
import {
  createPost,
  deletePost,
  getPost,
  incrementViewCount,
  listPosts,
  updatePost,
} from "./posts";
import { BlogPostStatus, BlogPostVisibility, } from "./types";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  sqlite = testDb.sqlite;
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "post-author", "Author", { id: "user-author", },);
  await insertUsers(db, "post-follower", "Follower", { id: "user-follower", },);
  await insertUsers(db, "post-other", "Other", { id: "user-other", },);
},);

describe("createPost", () => {
  test("applies defaults and round-trips through getPost", async () => {
    const row = await createPost(db, {
      author_id: "user-author",
      title: "Hello",
      body: "World",
    },);
    expect(row.title,).toBe("Hello",);
    expect(row.visibility,).toBe(BlogPostVisibility.Public,);
    expect(row.status,).toBe(BlogPostStatus.Draft,);
    expect(row.view_count,).toBe(0,);
    expect(typeof row.id,).toBe("string",);

    const fetched = await getPost(db, row.id,);
    expect(fetched?.title,).toBe("Hello",);
    expect(fetched?.tags,).toEqual([],);
  });

  test("persists tags on create", async () => {
    const row = await createPost(db, {
      author_id: "user-author",
      title: "Tagged",
      body: "body",
      tags: ["alpha", "beta",],
    },);
    expect((await getPost(db, row.id,))?.tags.toSorted(),).toEqual(["alpha", "beta",],);
  });

  test("scheduled_at creates a scheduled post", async () => {
    const row = await createPost(db, {
      author_id: "user-author",
      title: "Later",
      body: "body",
      scheduled_at: new Date(Date.now() + 3_600_000,).toISOString(),
    },);
    expect(row.status,).toBe(BlogPostStatus.Scheduled,);
    expect(row.scheduled_at,).not.toBeNull();
  });

  test("notifies followers of public posts", async () => {
    await follow(db, "user-follower", "user-author",);
    await createPost(db, {
      author_id: "user-author",
      title: "Announcement",
      body: "body",
    },);
    const notes = await db
      .selectFrom("notifications",)
      .select(["user_id", "title",],)
      .where("user_id", "=", "user-follower",)
      .execute();
    expect(notes.length,).toBeGreaterThanOrEqual(1,);
    expect(notes.some((n,) => n.title === "New blog post: Announcement"),).toBeTrue();
  });

  test("private posts do not notify followers", async () => {
    await follow(db, "user-follower", "user-author",);
    await createPost(db, {
      author_id: "user-author",
      title: "Secret",
      body: "body",
      visibility: BlogPostVisibility.Private,
    },);
    const notes = await db
      .selectFrom("notifications",)
      .select("id",)
      .where("user_id", "=", "user-follower",)
      .execute();
    expect(notes,).toEqual([],);
  });
});

describe("getPost", () => {
  test("returns undefined for unknown ids", async () => {
    expect(await getPost(db, "nope",),).toBeUndefined();
  });
});

describe("listPosts", () => {
  test("filters by author, visibility, status, and category", async () => {
    await createPost(db, {
      author_id: "user-author",
      title: "A1",
      body: "b",
      category: "news",
    },);
    await createPost(db, {
      author_id: "user-other",
      title: "B1",
      body: "b",
      visibility: BlogPostVisibility.Private,
    },);

    expect((await listPosts(db, { author_id: "user-author", },)).length,).toBe(1,);
    expect((await listPosts(db, { visibility: BlogPostVisibility.Private, },)).length,).toBe(1,);
    expect((await listPosts(db, { status: BlogPostStatus.Draft, },)).length,).toBe(2,);
    expect((await listPosts(db, { category: "news", },)).length,).toBe(1,);
    expect(await listPosts(db, { category: "missing", },),).toEqual([],);
  });

  test("followers-visibility filter only shows followed authors", async () => {
    await createPost(db, {
      author_id: "user-author",
      title: "Followed",
      body: "b",
      visibility: BlogPostVisibility.Followers,
    },);
    await createPost(db, {
      author_id: "user-other",
      title: "Stranger",
      body: "b",
      visibility: BlogPostVisibility.Followers,
    },);
    await follow(db, "user-follower", "user-author",);

    const rows = await listPosts(db, {
      visibility: BlogPostVisibility.Followers,
      userId: "user-follower",
    },);
    expect(Array.from(rows, (r,) => r.title,),).toEqual(["Followed",],);
  });

  test("limit and offset paginate newest-first", async () => {
    for (const title of ["P1", "P2", "P3",]) {
      await createPost(db, { author_id: "user-author", title, body: "b", },);
    }
    const page1 = await listPosts(db, { limit: 2, offset: 0, },);
    const page2 = await listPosts(db, { limit: 2, offset: 2, },);
    expect(page1.length,).toBe(2,);
    expect(page2.length,).toBe(1,);
    expect(page1[0]!.created_at >= page1[1]!.created_at,).toBeTrue();
  });

  test("batch-fetches tags for listed posts", async () => {
    await createPost(db, {
      author_id: "user-author",
      title: "Tagged",
      body: "b",
      tags: ["solo",],
    },);
    const rows = await listPosts(db, { author_id: "user-author", },);
    expect(rows[0]!.tags,).toEqual(["solo",],);
  });
});

describe("updatePost", () => {
  test("updates scalar fields and tags", async () => {
    const row = await createPost(db, {
      author_id: "user-author",
      title: "Old",
      body: "old body",
      tags: ["stale",],
    },);
    const updated = await updatePost(db, row.id, {
      title: "New",
      body: "new body",
      category: "essay",
      metadata: { mood: "bright", },
      tags: ["fresh",],
    },);
    expect(updated?.title,).toBe("New",);
    expect(updated?.body,).toBe("new body",);
    expect(updated?.category,).toBe("essay",);
    expect(JSON.parse(updated?.metadata ?? "{}",),).toEqual({ mood: "bright", },);
    expect(updated?.tags,).toEqual(["fresh",],);
  });

  test("publishing stamps published_at", async () => {
    const row = await createPost(db, {
      author_id: "user-author",
      title: "Draft",
      body: "b",
    },);
    const updated = await updatePost(db, row.id, { status: BlogPostStatus.Published, },);
    expect(updated?.status,).toBe(BlogPostStatus.Published,);
    expect(updated?.published_at,).not.toBeNull();
  });

  test("empty tags array clears tags", async () => {
    const row = await createPost(db, {
      author_id: "user-author",
      title: "T",
      body: "b",
      tags: ["x",],
    },);
    const updated = await updatePost(db, row.id, { tags: [], },);
    expect(updated?.tags,).toEqual([],);
  });

  test("returns undefined for unknown ids", async () => {
    expect(await updatePost(db, "nope", { title: "x", },),).toBeUndefined();
  });
});

describe("deletePost", () => {
  test("deletes the post and returns true", async () => {
    const row = await createPost(db, {
      author_id: "user-author",
      title: "Gone",
      body: "b",
    },);
    expect(await deletePost(db, row.id,),).toBeTrue();
    expect(await getPost(db, row.id,),).toBeUndefined();
  });

  test("returns false for unknown ids", async () => {
    expect(await deletePost(db, "nope",),).toBeFalse();
  });
});

describe("incrementViewCount", () => {
  test("increments from zero", async () => {
    const row = await createPost(db, {
      author_id: "user-author",
      title: "Views",
      body: "b",
    },);
    await incrementViewCount(db, row.id,);
    await incrementViewCount(db, row.id,);
    expect((await getPost(db, row.id,))?.view_count,).toBe(2,);
  });
});

describe("BlogService post dispatch", () => {
  test("delegates CRUD through the class", async () => {
    const svc = new BlogService(db,);
    const row = await svc.createPost({
      author_id: "user-author",
      title: "Svc",
      body: "b",
      tags: ["t",],
    },);
    expect((await svc.getPost(row.id,))?.title,).toBe("Svc",);
    expect((await svc.listPosts({ author_id: "user-author", },)).length,).toBe(1,);
    expect((await svc.updatePost(row.id, { title: "Svc2", },))?.title,).toBe("Svc2",);
    await svc.incrementViewCount(row.id,);
    expect((await svc.getPost(row.id,))?.view_count,).toBe(1,);
    expect(await svc.deletePost(row.id,),).toBeTrue();
    expect(await svc.getPost(row.id,),).toBeUndefined();
  });
});
