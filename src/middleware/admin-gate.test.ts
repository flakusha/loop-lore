import { describe, expect, it, } from "bun:test";
import { adminViewGuard, requireAdmin, } from "./admin-gate";
import { createRequestContext, } from "./types";

describe("requireAdmin", () => {
  it("allows admin role", async () => {
    const ctx = createRequestContext({ userId: "1", userRole: "admin", sessionId: null, },);
    let nextCalled = false;
    const result = await requireAdmin(new Request("http://localhost",), ctx, async () => {
      nextCalled = true;
      return new Response("ok",);
    },);
    expect(nextCalled,).toBe(true,);
    expect(result,).toBeInstanceOf(Response,);
  });

  it("allows solo role", async () => {
    const ctx = createRequestContext({ userId: "1", userRole: "solo", sessionId: null, },);
    let nextCalled = false;
    await requireAdmin(new Request("http://localhost",), ctx, async () => {
      nextCalled = true;
      return new Response("ok",);
    },);
    expect(nextCalled,).toBe(true,);
  });

  it("rejects regular user", async () => {
    const ctx = createRequestContext({ userId: "1", userRole: "user", sessionId: null, },);
    let nextCalled = false;
    const result = await requireAdmin(new Request("http://localhost",), ctx, async () => {
      nextCalled = true;
      return new Response("ok",);
    },);
    expect(nextCalled,).toBe(false,);
    expect(result,).toBeInstanceOf(Response,);
    const body = await result.json();
    expect(body.error,).toBeDefined();
    expect(result.status,).toBe(403,);
  });

  it("rejects null role", async () => {
    const ctx = createRequestContext({ userId: "1", userRole: null, sessionId: null, },);
    let nextCalled = false;
    await requireAdmin(new Request("http://localhost",), ctx, async () => {
      nextCalled = true;
      return new Response("ok",);
    },);
    expect(nextCalled,).toBe(false,);
  });
});

describe("adminViewGuard", () => {
  it("returns undefined for admin role (allow)", () => {
    const result = adminViewGuard({ userRole: "admin", },);
    expect(result,).toBeUndefined();
  });

  it("returns undefined for solo role (allow)", () => {
    const result = adminViewGuard({ userRole: "solo", },);
    expect(result,).toBeUndefined();
  });

  it("returns 302 redirect for regular user", () => {
    const result = adminViewGuard({ userRole: "user", },);
    expect(result,).toBeInstanceOf(Response,);
    expect(result!.status,).toBe(302,);
    expect(result!.headers.get("Location",),).toBe("/",);
  });

  it("returns 302 redirect for null role", () => {
    const result = adminViewGuard({ userRole: null, },);
    expect(result,).toBeInstanceOf(Response,);
    expect(result!.status,).toBe(302,);
  });
});
