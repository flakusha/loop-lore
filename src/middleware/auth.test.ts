import { describe, expect, it, } from "bun:test";
import { extractBearerToken, } from "./auth";

describe("extractBearerToken", () => {
  it("extracts token from Bearer header", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer abc123", },
    },);
    expect(extractBearerToken(req,),).toBe("abc123",);
  });

  it("trims whitespace from token", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer   abc123  ", },
    },);
    expect(extractBearerToken(req,),).toBe("abc123",);
  });

  it("returns null for non-Bearer auth", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Basic abc123", },
    },);
    expect(extractBearerToken(req,),).toBeNull();
  });

  it("returns null for missing Authorization header", () => {
    const req = new Request("http://localhost",);
    expect(extractBearerToken(req,),).toBeNull();
  });

  it("returns null for empty Bearer token", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer ", },
    },);
    expect(extractBearerToken(req,),).toBeNull();
  });
});
