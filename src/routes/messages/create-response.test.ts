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
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { createResponse, } from "./create-response";

/**
 * The expected 201 bodies live in `message-vectors.json`, which the Rust
 * egui client parses in its own suite (`native/loop-lore-egui/src/api.rs`).
 * Pinning the shapes here — rather than inline — means a server-side envelope
 * change fails this suite and, once the file is updated, fails the Rust suite
 * too until the parser follows.
 */
interface SentVector {
  name: string;
  body: Record<string, unknown>;
}

interface MessageVectors {
  context: Record<string, unknown>;
  sent: SentVector[];
}

const VECTORS: MessageVectors = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../native/loop-lore-egui/message-vectors.json",), "utf8",),
);

/**
 * Look up one pinned 201 body by shape name.
 * @param name shape name in the vectors file
 * @throws when the file no longer pins that shape
 */
const shape = (name: string,): SentVector => {
  const found = VECTORS.sent.find((candidate,) => candidate.name === name);
  if (found === undefined) { throw new Error(`message-vectors.json is missing the "${name}" shape`,); }
  return found;
};

const ID = "msg-1";
const CONTEXT = VECTORS.context;

const NO_REPLY = shape("no_reply",);
const WITH_ASSISTANT = shape("reply_with_assistant_message",);
const REPLY_WITHOUT_ROWS = shape("reply_without_any_message_row",);

describe("createResponse", () => {
  test("no reply returns 201 with the id and context", async () => {
    const res = await createResponse({ replied: false, }, ID, CONTEXT,);
    expect(res.status,).toBe(201,);
    expect(await res.json(),).toEqual(NO_REPLY.body,);
  });

  test("a 2xx generation body is merged into a 201 under context", async () => {
    const assistant = WITH_ASSISTANT.body.assistantMessage;
    const res = await createResponse(
      { replied: true, response: Response.json({ assistantMessage: assistant, },), },
      ID,
      CONTEXT,
    );

    expect(res.status,).toBe(201,);
    expect(await res.json(),).toEqual(WITH_ASSISTANT.body,);
  });

  test("a replied outcome with no response still returns 201 with the id", async () => {
    const res = await createResponse({ replied: true, }, ID, CONTEXT,);
    expect(res.status,).toBe(201,);
    expect(await res.json(),).toEqual(REPLY_WITHOUT_ROWS.body,);
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
