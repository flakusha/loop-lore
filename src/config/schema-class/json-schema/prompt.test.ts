// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Schema-class prompt shim: the json-schema surface re-exports the
 * single-source `promptMeta` from `src/config/sections/prompt.ts`.
 */
import { describe, expect, test, } from "bun:test";
import { promptMeta, } from "../../sections/prompt";
import { prompt, } from "./prompt";

describe("prompt schema-class shim", () => {
  test("re-exports the single-source promptMeta by reference", () => {
    expect(prompt,).toBe(promptMeta,);
  });
});
