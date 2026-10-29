// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Frame helper tests: title embedding, tag conversion, padding to the exact
 * width, and the long-title cut. Shared by every bordered surface.
 */
import { describe, expect, it, } from "bun:test";
import { renderFramed, } from "./frame";
import { stripRows, } from "./test-support";

describe("renderFramed", () => {
  it("wraps rows in a titled border of exactly the requested width", () => {
    const rows = renderFramed({ title: "Assets", rows: ["hello",], width: 20, },);
    expect(rows,).toHaveLength(3,);
    expect(stripRows(rows,).every((row,) => row.length === 20),).toBe(true,);
    expect(stripRows(rows,)[0]!,).toContain("Assets",);
    expect(stripRows(rows,)[1]!,).toContain("hello",);
  });

  it("converts blessed tags in body rows and truncates overlong ones", () => {
    const rows = renderFramed({
      title: "T",
      rows: ["{bold}over the width limit{/bold}",],
      width: 12,
      color: "yellow",
    },);

    const body = stripRows(rows,)[1]!;
    expect(body,).toHaveLength(12,);
    expect(rows[1]!,).toContain("\x1b[1m",);
    expect(rows[1]!,).not.toContain("{bold}",);
    expect(rows[0]!,).toContain("\x1b[33m",); // yellow border
  });

  it("cuts a title that does not fit", () => {
    const rows = renderFramed({ title: "A Very Long Title", rows: [], width: 10, },);
    expect(stripRows(rows,)[0]!.length,).toBe(10,);
  });
});
