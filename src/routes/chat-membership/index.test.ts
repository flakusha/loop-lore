// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat-membership barrel tests — mounts chatMembershipRoutes behind the same
 * derive-auth harness as the former chat route barrel.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { chatMembershipRoutes, } from "./index";

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
  const app = new Elysia({ name: "test-chat-membership-barrel", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }

  return app.use(chatMembershipRoutes({ database: db, config: {} as never, },),);
}

describe("chatMembershipRoutes barrel", () => {
  test("assembles an Elysia instance", () => {
    expect(makeApp("u1",),).toBeInstanceOf(Elysia,);
  });

  test("registers the joinable, join, and transfer surfaces", () => {
    const paths = makeApp("u1",).routes.map((r,) => r.path);
    expect(paths.some((p,) => p.includes("/api/chats/joinable",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/chats/join",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/chats/:id/transfer",)),).toBe(true,);
  });

  test("joinable without auth returns 401 through the barrel", async () => {
    const res = await makeApp().handle(new Request("http://localhost/api/chats/joinable",),);
    expect(res.status,).toBe(401,);
  });
});
