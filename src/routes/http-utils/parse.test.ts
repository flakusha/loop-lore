// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the clamped pagination parser.
 *
 * The parser is the single trust boundary for list pagination: a negative or
 * NaN size must never reach SQLite (LIMIT -1 returns the whole table, a NaN
 * offset raises "datatype mismatch"), and an oversized size must be clamped
 * instead of being served.
 */
import { describe, expect, test, } from "bun:test";
import { MAX_PAGE_SIZE, parsePaginationParams, } from "./parse";

describe("parsePaginationParams", () => {
  test("falls back to the defaults when the parameters are absent", () => {
    const result = parsePaginationParams({}, { defaultPageSize: 20, },);

    expect(result,).toEqual({ page: 1, pageSize: 20, offset: 0, },);
  });

  test("rejects a negative page size with 400", () => {
    const result = parsePaginationParams({ size: "-1", },);

    expect(result instanceof Response ? result.status : result,).toBe(400,);
  });

  test("rejects a zero page size with 400", () => {
    const result = parsePaginationParams({ size: "0", },);

    expect(result instanceof Response ? result.status : result,).toBe(400,);
  });

  test("rejects a non-numeric page size with 400", () => {
    const result = parsePaginationParams({ size: "abc", },);

    expect(result instanceof Response ? result.status : result,).toBe(400,);
  });

  test("rejects a fractional page size with 400", () => {
    const result = parsePaginationParams({ size: "1.5", },);

    expect(result instanceof Response ? result.status : result,).toBe(400,);
  });

  test("clamps an oversized page size to the cap", () => {
    const result = parsePaginationParams({ size: "999999", },);

    expect(result,).toEqual({ page: 1, pageSize: MAX_PAGE_SIZE, offset: 0, },);
  });

  test("honours a per-call page size cap", () => {
    const result = parsePaginationParams({ size: "999999", }, { maxPageSize: 200, },);

    expect(result,).toEqual({ page: 1, pageSize: 200, offset: 0, },);
  });

  test("derives the offset from the page and the page size", () => {
    const result = parsePaginationParams({ page: "3", size: "10", },);

    expect(result,).toEqual({ page: 3, pageSize: 10, offset: 20, },);
  });

  test("prefers an explicit offset over the page-derived one", () => {
    const result = parsePaginationParams({ size: "10", offset: "5", },);

    expect(result,).toEqual({ page: 1, pageSize: 10, offset: 5, },);
  });

  test("rejects a non-numeric or negative offset with 400", () => {
    const bad = parsePaginationParams({ offset: "abc", },);
    const negative = parsePaginationParams({ offset: "-1", },);

    expect(bad instanceof Response ? bad.status : bad,).toBe(400,);
    expect(negative instanceof Response ? negative.status : negative,).toBe(400,);
  });

  test("rejects a non-numeric or zero page with 400", () => {
    const bad = parsePaginationParams({ page: "abc", },);
    const zero = parsePaginationParams({ page: "0", },);

    expect(bad instanceof Response ? bad.status : bad,).toBe(400,);
    expect(zero instanceof Response ? zero.status : zero,).toBe(400,);
  });
});
