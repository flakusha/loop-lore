import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActorNotes, insertActors, insertUsers, } from "../test-utils/insert-helpers";
import {
  createActorNote,
  type CreateNoteInput,
  deleteActorNote,
  listActorNotes,
  updateActorNote,
} from "./actor-notes";

describe("actor notes service", () => {
  let db: Kysely<DB>;
  let actorId: string;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "owner", "Owner", { id: "user-owner", } as never,);
    await insertUsers(db, "other", "Other", { id: "user-other", } as never,);
    actorId = await insertActors(db, "Lyra", {
      id: "actor-lyra",
      owner_id: "user-owner",
    } as never,);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  it("creates a note with defaults, lists it pinned-first, and filters by category", async () => {
    const created = await createActorNote(db, actorId, "user-owner", "user", {
      title: "Rumors",
      content: "Knows about the smuggler cove",
    },);

    expect(created.ok,).toBe(true,);
    if (!created.ok) { return; }
    expect(created.entity.category,).toBe("general",);
    expect(created.entity.pinned,).toBe("unpinned",);

    await insertActorNotes(db, actorId, "Pinned", "pinned body", {
      pinned: "pinned",
    },);

    const listed = await listActorNotes(db, actorId, "user-owner", "user",);
    expect(listed.ok,).toBe(true,);
    if (listed.ok) {
      expect(listed.total,).toBe(2,);
      expect(listed.items[0]!.title,).toBe("Pinned",);
    }

    await createActorNote(db, actorId, "user-owner", "user", {
      title: "Plot hook",
      content: "body",
      category: "story",
    },);

    const stories = await listActorNotes(db, actorId, "user-owner", "user", {
      category: "story",
    },);

    expect(stories.ok,).toBe(true,);
    if (stories.ok) {
      expect(stories.total,).toBe(1,);
      expect(stories.items[0]!.title,).toBe("Plot hook",);
    }
  });

  it("rejects create when title or content missing", async () => {
    const noTitle = await createActorNote(db, actorId, "user-owner", "user", {
      content: "body",
    } as CreateNoteInput,);

    expect(noTitle,).toEqual({ ok: false, code: "bad_request", message: "title is required", },);

    const noContent = await createActorNote(db, actorId, "user-owner", "user", {
      title: "t",
      content: "",
    },);

    expect(noContent,).toEqual({ ok: false, code: "bad_request", message: "content is required", },);
  });

  it("updates a note without touching siblings", async () => {
    const created = await createActorNote(db, actorId, "user-owner", "user", {
      title: "before",
      content: "body",
    },);

    if (!created.ok) { throw new Error("seed failed",); }

    const updated = await updateActorNote(
      db,
      actorId,
      created.entity.id,
      "user-owner",
      "user",
      { title: "after", pinned: true, },
    );

    expect(updated.ok,).toBe(true,);
    if (!updated.ok) { return; }
    expect(updated.entity.title,).toBe("after",);
    expect(updated.entity.content,).toBe("body",);
    expect(updated.entity.pinned,).toBe("pinned",);
  });

  it("updates return not_found for a foreign-actor entity", async () => {
    const foreign = await insertActors(db, "Stranger", {
      id: "actor-stranger",
      owner_id: "user-owner",
    } as never,);

    const noteId = await insertActorNotes(db, foreign, "Foreign", "body",);

    const res = await updateActorNote(
      db,
      actorId,
      noteId,
      "user-owner",
      "user",
      { title: "hijack", },
    );

    expect(res,).toEqual({ ok: false, code: "not_found", message: "Note not found", },);
  });

  it("deletes a note and reports not_found for unknown ids", async () => {
    const created = await createActorNote(db, actorId, "user-owner", "user", {
      title: "scrap",
      content: "body",
    },);

    if (!created.ok) { throw new Error("seed failed",); }

    const deleted = await deleteActorNote(
      db,
      actorId,
      created.entity.id,
      "user-owner",
      "user",
    );

    expect(deleted,).toEqual({ ok: true, id: created.entity.id, },);

    const missing = await deleteActorNote(db, actorId, "no-note", "user-owner", "user",);
    expect(missing,).toEqual({ ok: false, code: "not_found", message: "Note not found", },);
  });

  it("distinguishes not_found from forbidden on the actor guard", async () => {
    const listed = await listActorNotes(db, "no-actor", "user-owner", "user",);
    expect(listed,).toEqual({ ok: false, code: "not_found", message: "Actor not found", },);

    const created = await createActorNote(db, actorId, "user-other", "user", {
      title: "t",
      content: "c",
    },);

    expect(created,).toEqual({ ok: false, code: "forbidden", message: "Not allowed", },);

    const admin = await listActorNotes(db, actorId, "user-other", "admin",);
    expect(admin.ok,).toBe(true,);
  });
});
