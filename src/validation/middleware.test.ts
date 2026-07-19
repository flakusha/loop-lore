import { TypeCompiler, } from "@sinclair/typebox/compiler";
import { describe, expect, test, } from "bun:test";
import { Elysia, t, } from "elysia";
import { onValidationError, } from "./middleware";
import {
  ActorCreateBody,
  AdminRoleUpdateBody,
  BatchIdsBody,
  ChatCreateBody,
  LoginBody,
  MessageCreateBody,
  MessageVisibilityUpdateBody,
  PaginationQuery,
  WorldCreateBody,
} from "./schemas";

// ── Schema validation tests ─────────────────────────────────

function compile(schema: any,) {
  return TypeCompiler.Compile(schema,);
}

describe("ChatCreateBody", () => {
  const C = compile(ChatCreateBody,);

  test("accepts valid body", () => {
    expect(C.Check({ name: "Test Chat", },),).toBe(true,);
  });

  test("accepts body with all optional fields", () => {
    expect(
      C.Check({
        name: "Test Chat",
        type: "group",
        mode: "story",
        turnStrategy: "round_robin",
        participantIds: ["abc", "def",],
        worldId: "00000000-0000-0000-0000-000000000001",
      },),
    ).toBe(true,);
  });

  test("rejects empty name", () => {
    expect(C.Check({ name: "", },),).toBe(false,);
  });

  test("rejects missing name", () => {
    expect(C.Check({},),).toBe(false,);
  });

  test("rejects invalid type", () => {
    expect(C.Check({ name: "Test", type: "invalid", },),).toBe(false,);
  });

  test("rejects invalid mode", () => {
    expect(C.Check({ name: "Test", mode: "invalid", },),).toBe(false,);
  });

  test("rejects invalid turn strategy", () => {
    expect(C.Check({ name: "Test", turnStrategy: "invalid", },),).toBe(false,);
  });
});

describe("MessageCreateBody", () => {
  const C = compile(MessageCreateBody,);

  test("accepts valid body", () => {
    expect(C.Check({ content: "Hello", },),).toBe(true,);
  });

  test("accepts body with all optional fields", () => {
    expect(
      C.Check({
        content: "Hello",
        parentId: "00000000-0000-0000-0000-000000000001",
        role: "user",
        contentType: "text",
        idempotencyKey: "key-123",
        attachments: [{ assetId: "asset-1", order: 0, caption: "img", label: "attachment", },],
      },),
    ).toBe(true,);
  });

  test("rejects empty content", () => {
    expect(C.Check({ content: "", },),).toBe(false,);
  });

  test("rejects missing content", () => {
    expect(C.Check({},),).toBe(false,);
  });

  test("rejects invalid role", () => {
    expect(C.Check({ content: "Hi", role: "invalid", },),).toBe(false,);
  });

  test("rejects invalid contentType", () => {
    expect(C.Check({ content: "Hi", contentType: "invalid", },),).toBe(false,);
  });
});

describe("ActorCreateBody", () => {
  const C = compile(ActorCreateBody,);

  test("accepts valid body", () => {
    expect(C.Check({ displayName: "Alice", },),).toBe(true,);
  });

  test("accepts with optional fields", () => {
    expect(
      C.Check({
        displayName: "Alice",
        actorType: "character",
        agentType: "ai",
        description: "A test character",
      },),
    ).toBe(true,);
  });

  test("rejects empty displayName", () => {
    expect(C.Check({ displayName: "", },),).toBe(false,);
  });

  test("rejects missing displayName", () => {
    expect(C.Check({},),).toBe(false,);
  });

  test("rejects invalid actorType", () => {
    expect(C.Check({ displayName: "Alice", actorType: "invalid", },),).toBe(false,);
  });
});

describe("BatchIdsBody", () => {
  const C = compile(BatchIdsBody,);

  test("accepts valid ids array", () => {
    expect(C.Check({ ids: ["abc", "def",], },),).toBe(true,);
  });

  test("rejects empty array", () => {
    expect(C.Check({ ids: [], },),).toBe(false,);
  });

  test("rejects missing ids", () => {
    expect(C.Check({},),).toBe(false,);
  });
});

describe("AdminRoleUpdateBody", () => {
  const C = compile(AdminRoleUpdateBody,);

  test("accepts valid role", () => {
    expect(C.Check({ role: "admin", },),).toBe(true,);
    expect(C.Check({ role: "user", },),).toBe(true,);
    expect(C.Check({ role: "viewer", },),).toBe(true,);
  });

  test("rejects invalid role", () => {
    expect(C.Check({ role: "superadmin", },),).toBe(false,);
  });
});

describe("MessageVisibilityUpdateBody", () => {
  const C = compile(MessageVisibilityUpdateBody,);

  test("accepts valid visibility", () => {
    expect(C.Check({ visibility: "visible", },),).toBe(true,);
  });

  test("rejects invalid visibility", () => {
    expect(C.Check({ visibility: "invalid", },),).toBe(false,);
  });
});

describe("LoginBody", () => {
  const C = compile(LoginBody,);

  test("accepts valid credentials", () => {
    expect(C.Check({ username: "alice", password: "secret123", },),).toBe(true,);
  });

  test("rejects empty username", () => {
    expect(C.Check({ username: "", password: "secret", },),).toBe(false,);
  });

  test("rejects empty password", () => {
    expect(C.Check({ username: "alice", password: "", },),).toBe(false,);
  });
});

describe("PaginationQuery", () => {
  const C = compile(PaginationQuery,);

  test("accepts defaults", () => {
    expect(C.Check({},),).toBe(true,);
  });

  test("accepts valid values", () => {
    expect(C.Check({ page: 2, pageSize: 50, },),).toBe(true,);
  });

  test("rejects pageSize over 200", () => {
    expect(C.Check({ pageSize: 201, },),).toBe(false,);
  });
});

describe("WorldCreateBody", () => {
  const C = compile(WorldCreateBody,);

  test("accepts valid body", () => {
    expect(C.Check({ name: "My World", },),).toBe(true,);
  });

  test("rejects empty name", () => {
    expect(C.Check({ name: "", },),).toBe(false,);
  });
});

// ── Middleware tests ────────────────────────────────────────

describe("onValidationError", () => {
  function createApp() {
    return new Elysia()
      .onError((ctx: any,) => onValidationError(ctx.code, ctx.error, ctx.set,))
      .post("/test", async ({ body, }: any,) => body, {
        body: t.Object({
          name: t.String({ minLength: 1, },),
          age: t.Numeric({ minimum: 0, },),
        },),
      },);
  }

  test("passes through valid data", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Alice", age: 25, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { name: string; age: number };
    expect(body.name,).toBe("Alice",);
    expect(body.age,).toBe(25,);
  });

  test("returns 422 with VALIDATION_ERROR for missing field", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(422,);
    const body = (await res.json()) as { error: string; code: string; details: { field: string }[] };
    expect(body.error,).toBe("Validation failed",);
    expect(body.code,).toBe("VALIDATION_ERROR",);
    expect(Array.isArray(body.details,),).toBe(true,);
    expect(body.details.length,).toBeGreaterThan(0,);
    expect(body.details.some((d: { field: string },) => d.field === "name"),).toBe(true,);
  });

  test("returns 422 with field-level details for multiple errors", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "", age: -5, },),
      },),
    );
    expect(res.status,).toBe(422,);
    const body = (await res.json()) as { details: { field: string }[] };
    expect(body.details.length,).toBeGreaterThanOrEqual(2,);
    const fields = body.details.map((d: { field: string },) => d.field);
    expect(fields,).toContain("name",);
    expect(fields,).toContain("age",);
  });

  test("returns 404 for unmatched routes", async () => {
    const app = createApp();
    const res = await app.handle(new Request("http://localhost/nonexistent",),);
    // Elysia returns 404 before onError fires, so status is 404 even though
    // our handler maps unknown errors to 500
    expect(res.status,).toBe(404,);
  });
});
