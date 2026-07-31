import { describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import { vnChoiceRoutes, } from "./vn-choices";

// Mock database
const mockDb = {
  selectFrom: () => ({
    selectAll: () => ({
      where: () => ({
        where: () => ({
          orderBy: () => ({
            execute: () => Promise.resolve([],),
            executeTakeFirst: () => Promise.resolve(null,),
          }),
          executeTakeFirst: () => Promise.resolve(null,),
        }),
        executeTakeFirst: () => Promise.resolve(null,),
      }),
      executeTakeFirst: () => Promise.resolve(null,),
    }),
  }),
  insertInto: () => ({
    values: () => ({
      execute: () => Promise.resolve({},),
    }),
  }),
  updateTable: () => ({
    set: () => ({
      where: () => ({
        execute: () => Promise.resolve({},),
      }),
    }),
  }),
};

const app = new Elysia().use(
  vnChoiceRoutes({ database: mockDb as any, }),
);

describe("vnChoiceRoutes", () => {
  it("GET /api/chats/:chatId/vn-choices requires auth", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/chats/test-chat-id/vn-choices",),
    );
    expect(res.status,).toBe(401,);
  });

  it("POST /api/chats/:chatId/vn-choices requires auth", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/chats/test-chat-id/vn-choices", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          sceneIndex: 0,
          label: "Fight the dragon",
        }),
      }),
    );
    expect(res.status,).toBe(401,);
  });
});
