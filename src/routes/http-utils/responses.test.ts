// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the JSON success helpers (positional paginated + non-object created).
 */
import { describe, expect, test, } from "bun:test";
import { jsonCreated, jsonPaginated, } from "./responses";

describe("jsonPaginated positional form", () => {
  test("builds pagination from positional args", async () => {
    const res = jsonPaginated([{ id: "a", },], 1, 1, 20,);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[]; pagination: { total: number; totalPages: number } };
    expect(body.data,).toHaveLength(1,);
    expect(body.pagination.total,).toBe(1,);
    expect(body.pagination.totalPages,).toBe(1,);
  });
});

describe("jsonCreated non-object payload", () => {
  test("wraps a string payload under data", async () => {
    const res = jsonCreated("hello",);
    expect(res.status,).toBe(201,);
    const body = await res.json() as { data: unknown };
    expect(body.data,).toBe("hello",);
  });
});
