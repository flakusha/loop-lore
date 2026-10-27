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
import { MAX_PAGE_SIZE, num, parseBody, parsePagination, parsePaginationParams, str, } from "./parse";

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

describe("parseBody", () => {
  test("parses a JSON body", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify({ name: "ada", },),
    },);

    expect(await parseBody(request,),).toEqual({ name: "ada", },);
  });

  test("parses a form-encoded body", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", },
      body: "name=ada&age=36",
    },);

    expect(await parseBody(request,),).toEqual({ name: "ada", age: "36", },);
  });

  test("answers 400 for a malformed JSON body", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: "{not json",
    },);

    const result = await parseBody(request,);

    expect(result instanceof Response ? result.status : result,).toBe(400,);
  });
});

describe("parsePagination", () => {
  test("falls back to the defaults", () => {
    expect(parsePagination(new URLSearchParams("",),),).toEqual({ page: 1, pageSize: 50, },);
  });

  test("clamps the page and page size to safe ranges", () => {
    expect(parsePagination(new URLSearchParams("page=0&pageSize=9999",),),).toEqual({ page: 1, pageSize: 200, },);
    expect(parsePagination(new URLSearchParams("page=3.7&pageSize=10.9",),),).toEqual({ page: 3, pageSize: 10, },);
    expect(parsePagination(new URLSearchParams("page=abc&pageSize=abc",),),).toEqual({ page: 1, pageSize: 50, },);
  });
});

describe("body field helpers", () => {
  test("str and num read the field as-is", () => {
    expect(str({ name: "ada", }, "name",),).toBe("ada",);
    expect(str({ name: "ada", }, "missing",),).toBeUndefined();
    expect(num({ age: 36, }, "age",),).toBe(36,);
    expect(num({ age: 36, }, "missing",),).toBeUndefined();
  });
});
