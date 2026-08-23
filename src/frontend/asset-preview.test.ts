// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";

// Importing the module MUST register `globalThis.openAssetPreview` as a side
// effect — that's the whole point of moving it to the core bundle.
import "./asset-preview";

describe("asset-preview global registration", () => {
  test("registers globalThis.openAssetPreview on import", () => {
    expect(typeof globalThis.openAssetPreview,).toBe("function",);
  },);

  test("openAssetPreview is callable with a string id (returns a promise)", () => {
    // We do not assert success — the test env has no DOM and no API. The
    // contract is purely that the global exists and accepts a string id.
    const result = globalThis.openAssetPreview("test-asset-id",);
    expect(result,).toBeInstanceOf(Promise,);
  },);
});
