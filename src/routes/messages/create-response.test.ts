// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Response mapping for POST /chats/:id/messages.
 *
 * create.coverage.test.ts drives these branches through the real route with a
 * live DB; this file pins the pure mapping directly, including the 503
 * pass-through that must not be re-wrapped as a 201.
 */
import { describe, expect, test, } from "bun:test";
import { createResponse, } from "./create-response";

const ID = "msg-1";
const CONTEXT = { usedTokens: 42, maxTokens: 100, };

/** `jsonCreated` stamps an api_version envelope key on every 201 body. */
const META = { api_version: "1", };

describe("createResponse", () => {
  test("no reply returns 201 with the id and context", async () => {
    const res = await createResponse({ replied: false, }, ID, CONTEXT,);
    expect(res.status,).toBe(201,);
    expect(await res.json(),).toEqual({ id: ID, context: CONTEXT, meta: META, },);
  });

  test("a 2xx generation body is merged into a 201 under context", async () => {
    const res = await createResponse(
      { replied: true, response: Response.json({ assistantMessage: { id: "a1", }, },), },
      ID,
      CONTEXT,
    );

    expect(res.status,).toBe(201,);
    expect(await res.json(),).toEqual({ assistantMessage: { id: "a1", }, context: CONTEXT, meta: META, },);
  });

  test("a replied outcome with no response still returns 201 with the id", async () => {
    const res = await createResponse({ replied: true, }, ID, CONTEXT,);
    expect(res.status,).toBe(201,);
    expect(await res.json(),).toEqual({ context: CONTEXT, meta: META, },);
  });

  // BUG-message-create-re-wraps-a-503-reply-into-201-jsoncreated
  test("a failed generation is propagated verbatim, not re-wrapped as 201", async () => {
    const res = await createResponse(
      {
        replied: true,
        response: Response.json({ error: "swipe retries exhausted", }, { status: 503, },),
      },
      ID,
      CONTEXT,
    );

    expect(res.status,).toBe(503,);
    expect(await res.json(),).toEqual({ error: "swipe retries exhausted", id: ID, context: CONTEXT, },);
  });

  test("a 2xx status is treated as success, not as a failure passthrough", async () => {
    const res = await createResponse(
      { replied: true, response: Response.json({ ok: true, }, { status: 204, },), },
      ID,
      CONTEXT,
    );

    expect(res.status,).toBe(201,);
  });
});
