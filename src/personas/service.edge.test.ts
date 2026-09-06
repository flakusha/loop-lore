// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { PersonasService, } from "./service";

describe("PersonasService", () => {
  test("PersonasService class exists", () => {
    expect(PersonasService).toBeDefined();
    expect(typeof PersonasService).toBe("function");
  });
});