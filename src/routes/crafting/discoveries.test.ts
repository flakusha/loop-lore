// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { craftingDiscoveryRoutes, } from "./discoveries";

const mockDb = {} as any;

describe("craftingDiscoveryRoutes", () => {
  test("exports function", () => {
    expect(typeof craftingDiscoveryRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = craftingDiscoveryRoutes({ database: mockDb, },);
    expect(plugin,).toBeDefined();
  });
});
