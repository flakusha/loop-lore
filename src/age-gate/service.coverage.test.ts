import { describe, expect, test, } from "bun:test";
import { validateAge, } from "./service";

describe("age-gate boundary", () => {
  test("validateAge throws on invalid date string", () => {
    expect(() => validateAge("not-a-date", 18,)).toThrow();
  });
});
