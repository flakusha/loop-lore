import { describe, expect, test, } from "bun:test";
import { redirectTo, } from "./redirect";

describe("redirectTo", () => {
  test("returns a 302 that points at the requested location", async () => {
    const res = redirectTo("/login",);
    expect(res.status,).toBe(302,);
    expect(res.headers.get("Location",),).toBe("/login",);
    expect(await res.text(),).toBe("",);
  });
});
