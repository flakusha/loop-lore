import { describe, expect, it, } from "bun:test";
import { adminViewGuard, } from "./admin-gate";

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
