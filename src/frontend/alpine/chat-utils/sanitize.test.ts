// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { SANITIZE_CONFIG, } from "./sanitize";

describe("SANITIZE_CONFIG", () => {
  test("allows basic formatting tags", () => {
    expect(SANITIZE_CONFIG.ALLOWED_TAGS,).toContain("b",);
    expect(SANITIZE_CONFIG.ALLOWED_TAGS,).toContain("i",);
    expect(SANITIZE_CONFIG.ALLOWED_TAGS,).toContain("strong",);
  });

  test("allows anchor tags with safe attributes", () => {
    expect(SANITIZE_CONFIG.ALLOWED_TAGS,).toContain("a",);
    expect(SANITIZE_CONFIG.ALLOWED_ATTR,).toContain("href",);
  });

  test("does not allow script tags", () => {
    expect(SANITIZE_CONFIG.ALLOWED_TAGS,).not.toContain("script",);
    expect(SANITIZE_CONFIG.ALLOWED_TAGS,).not.toContain("iframe",);
  });
});
