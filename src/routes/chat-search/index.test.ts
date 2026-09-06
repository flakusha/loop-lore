// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat-search barrel tests — mounts chatSearchRoutes behind the same
 * derive-auth harness as dice.test.ts and verifies the wiring.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { chatSearchRoutes, } from "./index";

let db: Kysely<DB>;

beforeAll(async () => {
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

/**
 * @param userId optional authenticated user
 */
function makeApp(userId?: string,) {
  const app = new Elysia({ name: "test-chat-search-barrel", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }
  return app.use(chatSearchRoutes({ database: db, config: {} as never, },),);
}

describe("chatSearchRoutes barrel", () => {
  test("assembles an Elysia instance", () => {
    expect(makeApp("u1",),).toBeInstanceOf(Elysia,);
  });

  test("registers the search, joinable, join, and transfer surfaces", () => {
    const paths = makeApp("u1",).routes.map((r,) => r.path);
    expect(paths.some((p,) => p.includes("/api/chats/search",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/chats/joinable",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/chats/join",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/chats/transfer",) || p.includes("/api/chats/:id/transfer",)),).toBe(
      true,
    );
  });

  test("search without auth returns 401 through the barrel", async () => {
    const res = await makeApp().handle(new Request("http://localhost/api/chats/search?q=hello",),);
    expect(res.status,).toBe(401,);
  });
});
