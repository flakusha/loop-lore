// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { TerrainType } from "./terrain";

describe("battle integration terrain", () => {
  test("terrain types exist", () => {
    expect(typeof TerrainType).toBe("object");
  });
});
