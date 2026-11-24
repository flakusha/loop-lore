// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { migrate, } from "./migrate";

describe("migrate CLI", () => {
  test("releases the DB handle when migrations throw", async () => {
    let destroyed = 0;
    const fake = {
      destroy: async () => {
        destroyed += 1;
      },
    } as never;

    await expect(migrate({ openDatabase: () => fake, },),).rejects.toThrow();
    expect(destroyed,).toBe(1,);
  });
});
