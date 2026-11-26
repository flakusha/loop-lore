// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { Options, } from "html-minifier-terser";
import { checkTemplate, } from "./check-html-minify-parity";

describe("checkTemplate", () => {
  test("fails on a nested-quote mustache directive", async () => {
    const html = '<button title="{{{t("nested")}}}">x</button>';
    const errors = await checkTemplate("nested.html", html,);
    expect(errors,).toHaveLength(1,);
    expect(errors[0],).toContain("parse error",);
  });

  test("fails when minifier options strip guarded attributes", async () => {
    const html = '<button data-testid="" hx-post="" @click="" :class="">x</button>';
    const options: Options = { removeEmptyAttributes: () => true, };
    const errors = await checkTemplate("stripped.html", html, options,);
    expect(errors,).toEqual([
      "stripped.html:1: data-testid attribute drift 1 -> 0",
      "stripped.html:1: @* attribute drift 1 -> 0",
      "stripped.html:1: :* attribute drift 1 -> 0",
      "stripped.html:1: hx-* attribute drift 1 -> 0",
    ],);
  });
});
