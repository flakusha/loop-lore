// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { initEguiStream, } from "./egui-stream";

describe("initEguiStream", () => {
  test("exposes openGenerationStream and closeGenerationStream on globalThis", () => {
    initEguiStream();
    const g = globalThis as Record<string, unknown>;
    expect(typeof g.openGenerationStream,).toBe("function",);
    expect(typeof g.closeGenerationStream,).toBe("function",);
  });
});
