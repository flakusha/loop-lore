// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for routes/http-utils/errors.ts#internalErrorResponse.
 *
 * The 500 envelope is what every handler's catch block returns, so the shape
 * is contract: a distinct SERVER_ERROR code (not the 400 a client error would
 * carry), the message passed through verbatim, and `data` present only when
 * the caller supplied it.
 */
import { describe, expect, test, } from "bun:test";
import { internalErrorResponse, } from "./errors";

/** Body shape every error helper produces. */
interface ErrorBody {
  error: string;
  code: string;
  meta: { api_version: string };
  data?: Record<string, unknown>;
}

describe("internalErrorResponse", () => {
  test("is a 500 carrying SERVER_ERROR, not a client-error code", async () => {
    const res = internalErrorResponse("Generation failed",);

    expect(res.status,).toBe(500,);
    const body = await res.json() as ErrorBody;
    expect(body.code,).toBe("SERVER_ERROR",);
    // A 500 that reported BAD_REQUEST would be indistinguishable from a
    // client mistake in the FE error handling.
    expect(body.code,).not.toBe("BAD_REQUEST",);
  });

  test("passes the message through verbatim as `error`", async () => {
    const message = "Question generation failed for chat abc";
    const body = await internalErrorResponse(message,).json() as ErrorBody;

    expect(body.error,).toBe(message,);
  });

  test("stamps the current api version in meta", async () => {
    const body = await internalErrorResponse("boom",).json() as ErrorBody;

    expect(body.meta.api_version,).toBe("1",);
  });

  test("omits `data` entirely when the caller passes none", async () => {
    const res = internalErrorResponse("boom",);
    const body = await res.json() as ErrorBody;

    expect(Object.hasOwn(body, "data",),).toBe(false,);
  });

  test("carries the caller's `data` payload when supplied", async () => {
    const body = await internalErrorResponse("boom", { chatId: "chat-7", step: "persist", },)
      .json() as ErrorBody;

    expect(body.data,).toEqual({ chatId: "chat-7", step: "persist", },);
  });

  test("an empty data object still counts as supplied", async () => {
    const body = await internalErrorResponse("boom", {},).json() as ErrorBody;

    // jsonError spreads `data` only when truthy — {} is truthy, so the key is
    // present; this pins the choice rather than leaving it incidental.
    expect(Object.hasOwn(body, "data",),).toBe(true,);
  });
});
