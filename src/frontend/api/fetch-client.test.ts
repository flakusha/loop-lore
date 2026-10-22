// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Decode tests for the frontend error-envelope client. */

import { afterEach, describe, expect, test, } from "bun:test";
import { type ApiError, decodeApiError, fetchClient, readApiError, setFetchTransport, } from "./fetch-client";

const realFetch = globalThis.fetch;

afterEach(() => {
  (globalThis as { fetch: unknown }).fetch = realFetch;
},);

describe("decodeApiError", () => {
  test("decodes a full envelope with all fields", () => {
    expect(decodeApiError({
      error_code: "TOO_MANY_REQUESTS",
      message: "Slow down",
      details: { limit: 1, },
      request_id: "req-2",
      retry_after_ms: 250,
    }, 429,),).toEqual({
      error_code: "TOO_MANY_REQUESTS",
      message: "Slow down",
      details: { limit: 1, },
      request_id: "req-2",
      retry_after_ms: 250,
      status: 429,
    },);
  });

  test("decodes a minimal envelope (only error_code + message)", () => {
    expect(decodeApiError({ error_code: "NOT_FOUND", message: "Nope", }, 404,),).toEqual({
      error_code: "NOT_FOUND",
      message: "Nope",
      status: 404,
    },);
  });

  test("decodes the legacy { error, code } shape", () => {
    expect(decodeApiError({ error: "Nope", code: "NOT_FOUND", }, 404,),).toEqual({
      error_code: "NOT_FOUND",
      message: "Nope",
      status: 404,
    },);

    expect(decodeApiError({ error: "Boom", code: "SERVER_ERROR", data: { op: 1, }, }, 500,),).toEqual({
      error_code: "SERVER_ERROR",
      message: "Boom",
      details: { op: 1, },
      status: 500,
    },);
  });

  test("legacy shape without a code falls back to HTTP_<status>", () => {
    expect(decodeApiError({ error: "Nope", }, 404,),).toEqual({
      error_code: "HTTP_404",
      message: "Nope",
      status: 404,
    },);
  });

  test("returns undefined for non-error bodies", () => {
    for (const bad of [null, "nope", 42, [], {}, { error_code: "X", }, { message: "x", },]) {
      expect(decodeApiError(bad, 500,),).toBeUndefined();
    }
  });

  test("readApiError reads a Response body", async () => {
    const res = Response.json({ error_code: "FORBIDDEN", message: "No", request_id: "r", }, { status: 403, },);
    expect(await readApiError(res,),).toEqual({
      error_code: "FORBIDDEN",
      message: "No",
      request_id: "r",
      status: 403,
    },);
  });
});

describe("fetchClient", () => {
  function stubFetch(res: Response,) {
    setFetchTransport(async () => res);
  }

  test("success path returns the raw Response untouched", async () => {
    stubFetch(Response.json({ hello: "world", },),);
    const res = await fetchClient("/api/x",);
    expect(res.ok,).toBe(true,);
    expect(await res.json(),).toEqual({ hello: "world", },);
  });

  test("envelope body throws a typed ApiError", async () => {
    stubFetch(Response.json(
      { error_code: "NOT_FOUND", message: "Nope", request_id: "r", },
      { status: 404, },
    ),);

    const err = await fetchClient("/api/x",).catch((e,) => e as ApiError);
    expect(err,).toEqual({ error_code: "NOT_FOUND", message: "Nope", request_id: "r", status: 404, },);
  });

  test("legacy body throws a typed ApiError", async () => {
    stubFetch(Response.json({ error: "Nope", code: "NOT_FOUND", }, { status: 404, },),);
    const err = await fetchClient("/api/x",).catch((e,) => e as ApiError);
    expect(err,).toEqual({ error_code: "NOT_FOUND", message: "Nope", status: 404, },);
  });

  test("non-JSON body throws a generic Error carrying status", async () => {
    stubFetch(new Response("nope", { status: 500, },),);
    const err = await fetchClient("/api/x",).catch((e,) => e as Error & { status: number });
    expect(err,).toBeInstanceOf(Error,);
    expect(err.message,).toBe("HTTP 500",);
    expect(err.status,).toBe(500,);
  });
});
