// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { citationClickThrough, } from "./metrics";

describe("citationClickThrough", () => {
  test("half clicked", () => expect(citationClickThrough([{ id: "a", }, { id: "b", },], ["a",],),).toBe(0.5,));
  test("none", () => expect(citationClickThrough([{ id: "a", },], [],),).toBe(0,));
  test("empty citations", () => expect(citationClickThrough([], ["a",],),).toBe(0,));
});
