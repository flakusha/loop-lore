// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { PersonasService, } from "./service";

describe("PersonasService method presence", () => {
  test("PersonasService has delete method", () => {
    expect(typeof PersonasService.prototype.delete).toBe("function");
  });

  test("PersonasService has setDefault method", () => {
    expect(typeof PersonasService.prototype.setDefault).toBe("function");
  });

  test("PersonasService has getDefault method", () => {
    expect(typeof PersonasService.prototype.getDefault).toBe("function");
  });

  test("PersonasService has convertToCharacter method", () => {
    expect(typeof PersonasService.prototype.convertToCharacter).toBe("function");
  });

  test("PersonasService has listByUser method", () => {
    expect(typeof PersonasService.prototype.listByUser).toBe("function");
  });

  test("PersonasService has getById method", () => {
    expect(typeof PersonasService.prototype.getById).toBe("function");
  });

  test("PersonasService has update method", () => {
    expect(typeof PersonasService.prototype.update).toBe("function");
  });

  test("PersonasService has create method", () => {
    expect(typeof PersonasService.prototype.create).toBe("function");
  });
});