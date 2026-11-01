// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { brand, unbrand, } from "./brands.ts";

describe("brands", () => {
  test("brand creates branded value", () => {
    const id = brand<"UserId">("usr_abc",);
    expect(typeof id,).toBe("string",);
    expect(unbrand(id,),).toBe("usr_abc",);
  });

  test("unbrand extracts raw string", () => {
    const raw = "raw_123";
    const branded = brand<"ChatId">(raw,);
    expect(unbrand(branded,),).toBe(raw,);
  });
});
