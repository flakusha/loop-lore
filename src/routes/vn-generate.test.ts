import { describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import { vnGenerateRoutes, } from "./vn-generate";

// Mock database — flat self-referential chain (auth-gated routes fail before
// the DB path is exercised; methods exist only to satisfy route type surface).
const mockChain = {
  selectFrom: () => mockChain,
  innerJoin: () => mockChain,
  where: () => mockChain,
  select: () => mockChain,
  limit: () => mockChain,
  executeTakeFirst: () => Promise.resolve({ id: "test-actor-id", },),
};

const mockDb = mockChain;

// Mock config
const mockConfig = {
  generation: {
    defaultProvider: "test-provider",
    defaultModels: { "test-provider": "test-model", },
    providers: {
      openaiCompatible: [{ name: "test-provider", },],
    },
  },
} as any;

const app = new Elysia().use(
  vnGenerateRoutes({ database: mockDb as any, config: mockConfig, },),
);

describe("vnGenerateRoutes", () => {
  it("POST /api/chats/:chatId/vn/generate-story requires auth", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/chats/test-chat-id/vn/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ sceneIndex: 0, },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  it("POST /api/chats/:chatId/vn/generate-choices requires auth", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/chats/test-chat-id/vn/generate-choices", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ sceneIndex: 0, count: 3, },),
      },),
    );
    expect(res.status,).toBe(401,);
  });
});
