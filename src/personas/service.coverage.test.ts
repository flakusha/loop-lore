import { describe, expect, test, } from "bun:test";
// Supplemental: PersonasService needs Kysely DB instance; use existing test DB helper

describe("personas boundary", () => {
  test("service class exists", () => {
    const { PersonasService } = require("./service");
    expect(typeof PersonasService).toBe("function");
  });
});
