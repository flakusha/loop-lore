// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Planning service tests (epic-assistant-step-planning).
 *
 * Exercises the observable contract of every `PlanningService` method
 * against a real migrated test DB: which rows land, what `advance` refuses,
 * and that ownership scoping is what keeps one user's plan items invisible
 * to another.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { PlanItemKind, PlanItemState, PlanLinkRelation, } from "../db/enums-story/plans";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, insertPlanItems, insertUsers, } from "../test-utils/insert-helpers";
import { createPlanningService, } from "./service";

describe("createPlanningService", () => {
  let db: Kysely<DB>;
  let service: ReturnType<typeof createPlanningService>;
  let ownerId: string;
  let otherId: string;
  let chatId: string;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    service = createPlanningService(db,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  beforeEach(async () => {
    await db.deleteFrom("plan_links",).execute();
    await db.deleteFrom("plan_items",).execute();
    await db.deleteFrom("chats",).execute();
    await db.deleteFrom("users",).execute();

    ownerId = `user-${crypto.randomUUID()}`;
    otherId = `user-${crypto.randomUUID()}`;
    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, },);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, },);
    chatId = `chat-${crypto.randomUUID()}`;
    await insertChats(db, "Plan Chat", ownerId, { id: chatId, },);
  },);

  // ── create ────────────────────────────────────────────────

  test("create defaults state=todo, kind=step, position=0", async () => {
    const row = await service.create({ owner_id: ownerId, title: "Draft intro", },);
    expect(row.state,).toBe(PlanItemState.Todo,);
    expect(row.kind,).toBe(PlanItemKind.Step,);
    expect(row.position,).toBe(0,);
    expect(row.chat_id,).toBeNull();
    expect(row.parent_id,).toBeNull();
    expect(row.id,).toBeTruthy();
    // RETURNING-backed: the row really landed
    expect(await service.get(row.id,),).toMatchObject({ title: "Draft intro", },);
  });

  test("create honours explicit chat_id, kind, position and parent", async () => {
    const parent = await service.create({ owner_id: ownerId, title: "Parent", },);
    const child = await service.create({
      owner_id: ownerId,
      chat_id: chatId,
      title: "Child",
      kind: PlanItemKind.Draft,
      position: 3,
      parent_id: parent.id,
    },);

    expect(child.chat_id,).toBe(chatId,);
    expect(child.kind,).toBe(PlanItemKind.Draft,);
    expect(child.position,).toBe(3,);
    expect(child.parent_id,).toBe(parent.id,);
  });

  // ── get / list ────────────────────────────────────────────

  test("get returns null for an unknown id", async () => {
    expect(await service.get("no-such-item",),).toBeNull();
  });

  test("list is owner-scoped, ordered by position then created_at", async () => {
    await insertPlanItems(db, ownerId, "third", { position: 2, chat_id: chatId, },);
    await insertPlanItems(db, ownerId, "first", { position: 0, chat_id: chatId, },);
    await insertPlanItems(db, ownerId, "second", { position: 1, chat_id: chatId, },);
    await insertPlanItems(db, otherId, "not mine", { position: 0, chat_id: chatId, },);

    expect((await service.list(ownerId, chatId,)).map((r,) => r.title),).toEqual([
      "first",
      "second",
      "third",
    ],);
  });

  test("list without chatId returns every chat the owner owns", async () => {
    await insertPlanItems(db, ownerId, "chat-scoped", { chat_id: chatId, position: 1, },);
    await insertPlanItems(db, ownerId, "global", { chat_id: null, position: 0, },);
    expect((await service.list(ownerId,)).map((r,) => r.title),).toEqual(["global", "chat-scoped",],);
  });

  // ── update ────────────────────────────────────────────────

  test("update writes only the supplied fields and bumps updated_at", async () => {
    const before = await service.create({ owner_id: ownerId, title: "old", kind: PlanItemKind.Task, },);
    const after = await service.update(before.id, { title: "new", position: 5, },);
    expect(after!.title,).toBe("new",);
    expect(after!.position,).toBe(5,);
    // untouched columns survive
    expect(after!.kind,).toBe(PlanItemKind.Task,);
    expect(after!.state,).toBe(PlanItemState.Todo,);
    expect(after!.updated_at >= before.updated_at,).toBe(true,);
  });

  test("update returns null for an unknown id", async () => {
    expect(await service.update("nope", { title: "x", },),).toBeNull();
  });

  // ── advance ───────────────────────────────────────────────

  test("advance performs a legal transition", async () => {
    const item = await service.create({ owner_id: ownerId, title: "work", },);
    const doing = await service.advance(item.id, PlanItemState.Doing,);
    expect(doing!.state,).toBe(PlanItemState.Doing,);
    const done = await service.advance(item.id, PlanItemState.Done,);
    expect(done!.state,).toBe(PlanItemState.Done,);
    // reopen
    expect((await service.advance(item.id, PlanItemState.Todo,))!.state,).toBe(PlanItemState.Todo,);
  });

  test("advance throws and leaves the row untouched on an illegal transition", async () => {
    const item = await service.create({ owner_id: ownerId, title: "work", },);
    await service.advance(item.id, PlanItemState.Done,);
    expect(service.advance(item.id, PlanItemState.Doing,),).rejects.toThrow(
      "Invalid state transition: done → doing",
    );

    expect((await service.get(item.id,))!.state,).toBe(PlanItemState.Done,);
  });

  test("advance returns null for an unknown id without writing", async () => {
    expect(await service.advance("no-such-item", PlanItemState.Doing,),).toBeNull();
  });

  // ── delete ────────────────────────────────────────────────

  test("delete reports whether a row was actually removed", async () => {
    const item = await service.create({ owner_id: ownerId, title: "temp", },);
    expect(await service.delete(item.id,),).toBe(true,);
    expect(await service.get(item.id,),).toBeNull();
    expect(await service.delete(item.id,),).toBe(false,);
  });

  // ── links ─────────────────────────────────────────────────

  test("addLink persists the directed edge and returns it", async () => {
    const a = await service.create({ owner_id: ownerId, title: "a", },);
    const b = await service.create({ owner_id: ownerId, title: "b", },);
    const link = await service.addLink(a.id, b.id, PlanLinkRelation.Blocks,);
    expect(link.from_id,).toBe(a.id,);
    expect(link.to_id,).toBe(b.id,);
    expect(link.relation,).toBe(PlanLinkRelation.Blocks,);
    expect(await service.listLinks(a.id,),).toHaveLength(1,);
  });

  // `onConflict doNothing` + `executeTakeFirstOrThrow` means a duplicate edge
  // returns NO row, so the call throws rather than resolving idempotently.
  // Pinned so the route layer's error mapping is written against real
  // behaviour instead of an assumed upsert.
  test("addLink throws on a duplicate edge instead of duplicating it", async () => {
    const a = await service.create({ owner_id: ownerId, title: "a", },);
    const b = await service.create({ owner_id: ownerId, title: "b", },);
    await service.addLink(a.id, b.id, PlanLinkRelation.Blocks,);
    expect(service.addLink(a.id, b.id, PlanLinkRelation.Blocks,),).rejects.toThrow();
    // no duplicate row landed
    expect(await service.listLinks(a.id,),).toHaveLength(1,);
    // a different relation between the same pair IS a distinct edge
    await service.addLink(a.id, b.id, PlanLinkRelation.Relates,);
    expect(await service.listLinks(a.id,),).toHaveLength(2,);
  });

  test("listLinks matches from either end (undirected view of the edge)", async () => {
    const a = await service.create({ owner_id: ownerId, title: "a", },);
    const b = await service.create({ owner_id: ownerId, title: "b", },);
    await service.addLink(a.id, b.id, PlanLinkRelation.Derives,);
    expect((await service.listLinks(a.id,))[0]!.relation,).toBe(PlanLinkRelation.Derives,);
    expect((await service.listLinks(b.id,))[0]!.relation,).toBe(PlanLinkRelation.Derives,);
  });

  test("deleting a plan item cascades its links away", async () => {
    const a = await service.create({ owner_id: ownerId, title: "a", },);
    const b = await service.create({ owner_id: ownerId, title: "b", },);
    await service.addLink(a.id, b.id, PlanLinkRelation.References,);
    await service.delete(a.id,);
    expect(await service.listLinks(a.id,),).toHaveLength(0,);
  });
});
