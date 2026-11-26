// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ShadowNoteStatus, ShadowNoteType, } from "../../db/enums-gm";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import {
  type Annotation,
  clearMemoryAnnotations,
  createAnnotation,
  isAnnotationExpired,
  listMemoryAnnotations,
  removeMemoryAnnotationsForChat,
} from "./annotations";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
  await insertChats(db, "Shadow Chat", "owner", { id: "chat-shadow" as never, },);
  await insertChats(db, "Memory Chat", "owner", { id: "chat-mem" as never, },);
  await insertChats(db, "TTL Chat", "owner", { id: "chat-ttl" as never, },);
  await insertChats(db, "TTL Zero Chat", "owner", { id: "chat-ttl-zero" as never, },);
  await insertChats(db, "Kind Chat", "owner", { id: "chat-kind" as never, },);
},);

afterAll(async () => {
  clearMemoryAnnotations();
  await db.destroy();
},);

describe("createAnnotation — kind discriminator", () => {
  test.each(["note", "shadow", "quest",] as const,)(
    "kind=%s persists the correct discriminator",
    async (kind,) => {
      clearMemoryAnnotations();
      const annotation = await createAnnotation(db, {
        chatId: "chat-kind",
        actorId: "user-1",
        kind,
        body: `body-${kind}`,
      },);

      expect(annotation.kind,).toBe(kind,);
      expect(annotation.body,).toBe(`body-${kind}`,);
      expect(annotation.chatId,).toBe("chat-kind",);
      expect(annotation.actorId,).toBe("user-1",);
      expect(annotation.id,).toMatch(/^[0-9a-f-]{36}$/i,);
    },
  );

  test("rejects unknown kind", async () => {
    await expect(
      createAnnotation(db, {
        chatId: "chat-kind",
        actorId: "user-1",
        // @ts-expect-error: invalid kind at runtime, must throw
        kind: "marginalia",
        body: "x",
      },),
    ).rejects.toThrow(/Invalid annotation kind/,);
  });
});

describe("createAnnotation — shadow persistence", () => {
  test("shadow annotation writes a shadow_notes row", async () => {
    clearMemoryAnnotations();
    const annotation = await createAnnotation(db, {
      chatId: "chat-shadow",
      actorId: "user-1",
      kind: "shadow",
      body: "secret fact",
    },);

    const row = await db
      .selectFrom("shadow_notes",)
      .selectAll()
      .where("id", "=", annotation.id,)
      .executeTakeFirst();

    expect(row,).not.toBeNull();
    expect(row?.chat_id,).toBe("chat-shadow",);
    expect(row?.content,).toBe("secret fact",);
    expect(row?.type,).toBe(ShadowNoteType.HiddenFact,);
    expect(row?.status,).toBe(ShadowNoteStatus.Hidden,);
    expect(listMemoryAnnotations("chat-shadow",),).toHaveLength(0,);
  });

  test("note/quest annotations live only in the memory store", async () => {
    clearMemoryAnnotations();
    const note = await createAnnotation(db, {
      chatId: "chat-mem",
      actorId: "user-1",
      kind: "note",
      body: "remember the bread",
    },);

    const quest = await createAnnotation(db, {
      chatId: "chat-mem",
      actorId: "user-1",
      kind: "quest",
      body: "retrieve the sword",
    },);

    const memory = listMemoryAnnotations("chat-mem",);
    expect(memory.map((a: Annotation,) => a.id).sort(),).toEqual([note.id, quest.id,].sort(),);

    const noteRow = await db
      .selectFrom("shadow_notes",)
      .select(["id",],)
      .where("id", "=", note.id,)
      .executeTakeFirst();

    expect(noteRow,).toBeUndefined();
  });
});

describe("createAnnotation — TTL semantics", () => {
  test("ttlMs produces a future ttlUntil; default is null", async () => {
    clearMemoryAnnotations();
    const noTtl = await createAnnotation(db, {
      chatId: "chat-ttl",
      actorId: "user-1",
      kind: "note",
      body: "permanent",
    },);

    expect(noTtl.ttlUntil,).toBeNull();

    const future = await createAnnotation(db, {
      chatId: "chat-ttl",
      actorId: "user-1",
      kind: "note",
      body: "ephemeral",
      ttlMs: 60_000,
    },);

    expect(future.ttlUntil,).not.toBeNull();
    const futureMs = Date.parse(future.ttlUntil!,);
    const createdMs = Date.parse(future.createdAt,);
    expect(futureMs - createdMs,).toBe(60_000,);
    expect(futureMs,).toBeGreaterThan(Date.now(),);
  });

  test("isAnnotationExpired flips once now crosses ttlUntil", async () => {
    clearMemoryAnnotations();
    const ttlStart = new Date("2026-01-01T00:00:00.000Z",);
    const annotation: Annotation = {
      id: "a-1",
      chatId: "c-1",
      actorId: "u-1",
      kind: "note",
      body: "x",
      createdAt: ttlStart.toISOString(),
      ttlUntil: new Date(ttlStart.getTime() + 1000,).toISOString(),
    };

    expect(isAnnotationExpired(annotation, new Date(ttlStart.getTime() + 999,),),).toBe(false,);
    expect(isAnnotationExpired(annotation, new Date(ttlStart.getTime() + 1001,),),).toBe(true,);
    const noTtl: Annotation = { ...annotation, ttlUntil: null, };
    expect(isAnnotationExpired(noTtl, new Date(ttlStart.getTime() + 999_999,),),).toBe(false,);
  });

  test("ttlMs of 0 or negative yields a non-expiring annotation", async () => {
    clearMemoryAnnotations();
    const annotation = await createAnnotation(db, {
      chatId: "chat-ttl-zero",
      actorId: "user-1",
      kind: "note",
      body: "no expiry",
      ttlMs: 0,
    },);

    expect(annotation.ttlUntil,).toBeNull();
  });
});

describe("annotation TTL listing, sweep, and chat purge", () => {
  test("expired annotations are hidden from listings", async () => {
    clearMemoryAnnotations();
    await createAnnotation(db, { chatId: "chat-ttl", actorId: "owner", kind: "note", body: "ephemeral", ttlMs: 1, },);
    await Bun.sleep(5,);
    const live = await createAnnotation(db, {
      chatId: "chat-ttl",
      actorId: "owner",
      kind: "note",
      body: "sticky",
      ttlMs: 60_000,
    },);

    const listed = listMemoryAnnotations("chat-ttl",);
    expect(listed.map((a,) => a.id),).toEqual([live.id,],);
  });

  test("sweep frees memory once the store crosses the threshold", async () => {
    clearMemoryAnnotations();
    // Cross the sweep threshold with short-TTL entries, wait them out,
    // then force a sweep via another create.
    for (let i = 0; i < 205; i++) {
      await createAnnotation(db, { chatId: "chat-sweep", actorId: "owner", kind: "note", body: `e${i}`, ttlMs: 1, },);
    }

    await Bun.sleep(5,);
    await createAnnotation(db, {
      chatId: "chat-sweep",
      actorId: "owner",
      kind: "note",
      body: "trigger",
      ttlMs: 60_000,
    },);

    const listed = listMemoryAnnotations("chat-sweep",);
    expect(listed.length,).toBe(1,);
    expect(listed[0]?.body,).toBe("trigger",);
    clearMemoryAnnotations();
  });

  test("removeMemoryAnnotationsForChat purges the chat's in-memory entries", async () => {
    clearMemoryAnnotations();
    await createAnnotation(db, {
      chatId: "chat-purge",
      actorId: "owner",
      kind: "note",
      body: "doomed",
      ttlMs: 60_000,
    },);

    await createAnnotation(db, { chatId: "chat-keep", actorId: "owner", kind: "note", body: "safe", ttlMs: 60_000, },);

    removeMemoryAnnotationsForChat("chat-purge",);

    expect(listMemoryAnnotations("chat-purge",),).toEqual([],);
    expect(listMemoryAnnotations("chat-keep",).length,).toBe(1,);
    clearMemoryAnnotations();
  });
});
