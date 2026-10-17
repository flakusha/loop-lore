// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Board surface: the fragment renders the owner's rows as state columns with
 * kind swimlanes, a card move goes through `POST /plans/:id/advance` (the one
 * write path the todo view uses), foreign cards are invisible, and an illegal
 * move leaves the card in its persisted column.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { PlanItemState, } from "../db/enums-story/plans";
import type { DB, } from "../db/schema";
import { createPlanningService, } from "../planning/service";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, insertPlanItems, insertPlanLinks, insertUsers, } from "../test-utils/insert-helpers";
import { planningRoutes, } from "./planning";
import { planningBoardRoutes, } from "./planning-board";

const PREFIX = "/api/v1";

/**
 * @param db
 * @param userId
 * @returns both planning surfaces mounted, as base-surface does
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-planning-board", },);
  if (userId) {
    app.derive(() => ({ userId, }));
  }

  return app.use(planningRoutes({ database: db, }, PREFIX,),).use(planningBoardRoutes({ database: db, }, PREFIX,),);
}

/**
 * @param id
 * @param state
 * @returns the request the board's move buttons / drop handler issue
 */
function advanceRequest(id: string, state: string,) {
  return new Request(`http://localhost${PREFIX}/plans/${id}/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify({ state, },),
  },);
}

describe("GET /planning/kanban", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let chatId: string;
  let ownItem: string;
  let foreignItem: string;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertUsers(db, "user2", "User Two", { id: "user2" as never, },);
    chatId = await insertChats(db, "Board Chat", "user1",);
    ownItem = await insertPlanItems(db, "user1", "Write the board", {
      id: "board-own" as never,
      chat_id: chatId,
      kind: "story",
    },);

    await insertPlanItems(db, "user1", "Sketch a draft", { id: "board-draft" as never, kind: "draft", },);
    await insertPlanLinks(db, ownItem, "board-draft", "relates",);
    foreignItem = await insertPlanItems(db, "user2", "Foreign plan", { id: "board-foreign" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("returns 401 without a userId", async () => {
    const res = await makeApp(db,).handle(new Request(`http://localhost${PREFIX}/planning/kanban`,),);

    expect(res.status,).toBe(401,);
  });

  test("renders state columns, kind swimlanes, and resolved per-card links", async () => {
    const res = await makeApp(db, "user1",).handle(new Request(`http://localhost${PREFIX}/planning/kanban`,),);
    const html = await res.text();

    expect(res.status,).toBe(200,);
    expect(html,).toContain('data-testid="planning-column-todo"',);
    expect(html,).toContain('data-testid="planning-lane-todo-story"',);
    expect(html,).toContain('data-testid="planning-lane-todo-draft"',);
    expect(html,).toContain("Write the board",);
    // chat_id resolves to a real chat row → the card links to it
    expect(html,).toContain(`href="/views/chat?chatid=${chatId}"`,);
    // plan_links resolve to the owned draft card
    expect(html,).toContain('href="#planning-card-board-draft"',);
  });

  test("a foreign user's card never appears on the board", async () => {
    const res = await makeApp(db, "user1",).handle(new Request(`http://localhost${PREFIX}/planning/kanban`,),);
    const html = await res.text();

    expect(html,).not.toContain("Foreign plan",);
    expect(html,).not.toContain(foreignItem,);
  });

  test("a card move through the board endpoint updates the row both views read", async () => {
    const res = await makeApp(db, "user1",).handle(advanceRequest(ownItem, "doing",),);

    expect(res.status,).toBe(200,);

    // The todo projection is the same owner-scoped read; it must report the
    // new state, not a board-private copy.
    const todoRows = await createPlanningService(db,).list("user1",);
    expect(todoRows.find((row,) => row.id === ownItem)?.state,).toBe(PlanItemState.Doing,);

    const board = await makeApp(db, "user1",).handle(new Request(`http://localhost${PREFIX}/planning/kanban`,),);
    const html = await board.text();
    expect(html,).toContain('data-testid="planning-lane-doing-story"',);
    expect(html,).not.toContain('data-testid="planning-lane-todo-story"',);
  });

  test("moving a foreign card is rejected with 404 and leaves the row untouched", async () => {
    const res = await makeApp(db, "user1",).handle(advanceRequest(foreignItem, "doing",),);

    expect(res.status,).toBe(404,);
    const row = await createPlanningService(db,).get(foreignItem,);
    expect(row?.state,).toBe(PlanItemState.Todo,);
  });

  test("an illegal move is answered 409 and the card stays in its column", async () => {
    await db.updateTable("plan_items",).set({ state: "blocked", },).where("id", "=", ownItem,).execute();

    const res = await makeApp(db, "user1",).handle(advanceRequest(ownItem, "done",),);

    expect(res.status,).toBe(409,);
    const row = await createPlanningService(db,).get(ownItem,);
    expect(row?.state,).toBe(PlanItemState.Blocked,);

    const board = await makeApp(db, "user1",).handle(new Request(`http://localhost${PREFIX}/planning/kanban`,),);
    const html = await board.text();
    expect(html,).toContain('data-testid="planning-lane-blocked-story"',);
    // blocked → done is illegal, so no move button offers it
    expect(html,).not.toContain(`planning-move-${ownItem}-done`,);
  });
});
