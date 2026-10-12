import { describe, expect, test, } from "bun:test";
import { PersonasService, } from "./service";
// Supplemental: PersonasService needs Kysely DB instance; use existing test DB helper

describe("personas boundary", () => {
  test("service class exists", () => {
    expect(typeof PersonasService,).toBe("function",);
  });
});
