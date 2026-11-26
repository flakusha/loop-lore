// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/** Base capability listing needs no network or database. */
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../../../../../../src/logger";
import { SDServerEditProvider, } from "./index";

// The provider reads the config, and the config loader logs. Without a root
// logger that read throws, and the test would fail for a reason of its own.
createLogger({ level: "error", },);

describe("SDServerEditProvider capabilities", () => {
  test("lists base categories and reports api family", async () => {
    const provider = new SDServerEditProvider();
    const caps = await provider.listCapabilities();
    expect(caps,).toContain("txt2img",);
    expect((await provider.getCapabilities()).features,).toEqual(caps,);
  });
});
