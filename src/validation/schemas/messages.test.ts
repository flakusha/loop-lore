// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Edge-case tests for message route validation schemas.
 *
 * The 5 tests in middleware.test.ts covering MessageCreateBody are
 * positive-path + happy negative only. This file pins boundary contracts
 * across the message schemas so future tightening is intentional, not
 * silent.
 */
import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import {
  MessageAttachmentSchema,
  MessageCreateBody,
  MessagesQuery,
  MessageSearchQuery,
  MessageStatusUpdateBody,
  MessageVariantBody,
  MessageVisibilityUpdateBody,
} from "./messages";

/**
 * @param fields
 */
function body(fields: Record<string, unknown>,) {
  return fields;
}

describe("MessageCreateBody — additional field edge cases", () => {
  test("parentId accepts a valid UUID format", () => {
    expect(
      Value.Check(MessageCreateBody, body({
        content: "hi",
        parentId: "550e8400-e29b-41d4-a716-446655440000",
      },),),
    ).toBe(true,);
  });

  test("parentId rejects a non-UUID string (format enforced)", () => {
    // OptionalId uses t.String({ format: "uuid" }) — non-UUIDs rejected.
    expect(
      Value.Check(MessageCreateBody, body({
        content: "hi",
        parentId: "not-a-uuid",
      },),),
    ).toBe(false,);
  });

  test("parentId accepts null being OMITTED (skip parent linkage)", () => {
    // not to pass null. The route layer (create.ts) normalizes undefined
    // → null, so a missing parentId in the request body is fine.
    expect(
      Value.Check(MessageCreateBody, body({ content: "root", },),),
    ).toBe(true,);
  });

  test("parentId rejects explicit null (OptionalId is not nullable)", () => {
    // Pin: passing parentId: null is rejected by schema. Route handlers
    // should accept undefined/missing and normalize to null, not pass
    // through explicit null from the client. If you see this fail, the
    // schema has been changed to t.Nullable — that's a contract change.
    expect(
      Value.Check(MessageCreateBody, body({ content: "root", parentId: null, },),),
    ).toBe(false,);
  });

  test("idempotencyKey accepts an empty string", () => {
    // t.String without minLength → "" valid. Pin: empty key passes schema;
    // the route layer treats "" as "no key" (truthy check in create.ts).
    expect(
      Value.Check(MessageCreateBody, body({
        content: "hi",
        idempotencyKey: "",
      },),),
    ).toBe(true,);
  });

  test("idempotencyKey accepts a 1 KB string (no maxLength)", () => {
    expect(
      Value.Check(MessageCreateBody, body({
        content: "hi",
        idempotencyKey: "k".repeat(1024,),
      },),),
    ).toBe(true,);
  });

  test("attachments accepts an empty array (no minItems)", () => {
    expect(
      Value.Check(MessageCreateBody, body({
        content: "hi",
        attachments: [],
      },),),
    ).toBe(true,);
  });

  test("attachments accepts a 100-item array (no maxItems)", () => {
    const items = Array.from({ length: 100, }, (_, i,) => ({
      assetId: `asset-${i}`,
      order: i,
      caption: `cap ${i}`,
      label: `lbl ${i}`,
    }),);
    expect(
      Value.Check(MessageCreateBody, body({ content: "hi", attachments: items, },),),
    ).toBe(true,);
  });

  test("attachments items without order/caption/label are accepted", () => {
    expect(
      Value.Check(MessageCreateBody, body({
        content: "hi",
        attachments: [{ assetId: "a1", },],
      },),),
    ).toBe(true,);
  });

  test("role accepts every documented enum value", () => {
    for (const role of ["user", "assistant", "character", "system",]) {
      expect(
        Value.Check(MessageCreateBody, body({ content: "hi", role, },),),
      ).toBe(true,);
    }
  });

  test("role rejects unknown strings", () => {
    // Pin: t.UnionEnum is case-sensitive. "User" with capital U must fail.
    expect(
      Value.Check(MessageCreateBody, body({ content: "hi", role: "User", },),),
    ).toBe(false,);
    expect(
      Value.Check(MessageCreateBody, body({ content: "hi", role: "tool", },),),
    ).toBe(false,);
    expect(
      Value.Check(MessageCreateBody, body({ content: "hi", role: "narrator", },),),
    ).toBe(false,);
  });

  test("contentType accepts every documented enum value", () => {
    for (const ct of ["text", "action", "narration", "system", "continuation",]) {
      expect(
        Value.Check(MessageCreateBody, body({ content: "hi", contentType: ct, },),),
      ).toBe(true,);
    }
  });

  test("contentType rejects unknown strings", () => {
    expect(
      Value.Check(MessageCreateBody, body({ content: "hi", contentType: "tool_result", },),),
    ).toBe(false,);
  });
},);

describe("MessageAttachmentSchema — standalone", () => {
  test("accepts an object with only assetId", () => {
    expect(Value.Check(MessageAttachmentSchema, body({ assetId: "a1", },),),).toBe(true,);
  });

  test("rejects an object missing assetId", () => {
    expect(Value.Check(MessageAttachmentSchema, body({ caption: "no id", },),),).toBe(false,);
  });

  test("accepts assetId as empty string (no minLength)", () => {
    // Schema pin: assetId is t.String() with no length constraint. The
    // ownership check downstream (AttachmentOwnershipError) is what
    // rejects unknown IDs — schema does not.
    expect(Value.Check(MessageAttachmentSchema, body({ assetId: "", },),),).toBe(true,);
  });
},);

describe("MessageVariantBody", () => {
  test("accepts variantIndex 0 (lower bound)", () => {
    expect(Value.Check(MessageVariantBody, body({ variantIndex: 0, },),),).toBe(true,);
  });

  test("accepts variantIndex 1", () => {
    expect(Value.Check(MessageVariantBody, body({ variantIndex: 1, },),),).toBe(true,);
  });

  test("rejects variantIndex -1 (below minimum)", () => {
    expect(Value.Check(MessageVariantBody, body({ variantIndex: -1, },),),).toBe(false,);
  });

  test("rejects non-numeric string (TypeBox range quirk: bypass for strings)", () => {
    // REAL FINDING: same quirk as chat.test.ts — t.Numeric with minimum
    // enforces range on number values only, not on string-pass-through.
    // A client sending variantIndex: "100" passes validation.
    expect(
      Value.Check(MessageVariantBody, body({ variantIndex: "100", },),),
    ).toBe(true,);
  });
},);

describe("MessageVisibilityUpdateBody / MessageStatusUpdateBody", () => {
  test("MessageVisibilityUpdateBody accepts every documented visibility value", () => {
    for (const v of ["visible", "hidden_by_user", "hidden_by_moderator", "auto_hidden", "redacted",]) {
      expect(
        Value.Check(MessageVisibilityUpdateBody, body({ visibility: v, },),),
      ).toBe(true,);
    }
  });

  test("MessageVisibilityUpdateBody rejects unknown visibility", () => {
    expect(
      Value.Check(MessageVisibilityUpdateBody, body({ visibility: "public", },),),
    ).toBe(false,);
  });

  test("MessageVisibilityUpdateBody accepts an arbitrary reason string", () => {
    // reason is t.Optional(t.String()) — no constraint. Pin.
    expect(
      Value.Check(MessageVisibilityUpdateBody, body({
        visibility: "hidden_by_moderator",
        reason: "x".repeat(10_000,),
      },),),
    ).toBe(true,);
  });

  test("MessageStatusUpdateBody accepts every documented status", () => {
    for (const s of ["sending", "confirmed", "failed", "partial", "rejected", "cancelled",]) {
      expect(Value.Check(MessageStatusUpdateBody, body({ status: s, },),),).toBe(true,);
    }
  });

  test("MessageStatusUpdateBody rejects unknown status", () => {
    expect(
      Value.Check(MessageStatusUpdateBody, body({ status: "delivered", },),),
    ).toBe(false,);
  });
},);

describe("MessagesQuery — pagination edge cases", () => {
  test("accepts page=1, pageSize=20 (defaults)", () => {
    expect(Value.Check(MessagesQuery, body({},),),).toBe(true,);
  });

  test("accepts pageSize at the maximum (200)", () => {
    expect(
      Value.Check(MessagesQuery, body({ pageSize: 200, },),),
    ).toBe(true,);
  });

  test("rejects pageSize above the maximum (201) — DoS guard", () => {
    // This is the route's only pagination DoS guard. Pin it: a client
    // requesting >200 messages is rejected.
    expect(
      Value.Check(MessagesQuery, body({ pageSize: 201, },),),
    ).toBe(false,);
  });

  test("rejects page=0 (must be >= 1)", () => {
    expect(Value.Check(MessagesQuery, body({ page: 0, },),),).toBe(false,);
  });

  test("accepts parentId as any string (no format constraint)", () => {
    expect(
      Value.Check(MessagesQuery, body({ parentId: "any-string", },),),
    ).toBe(true,);
  });
},);

describe("MessageSearchQuery — search boundaries", () => {
  test("accepts q at the maximum (500 chars)", () => {
    expect(
      Value.Check(MessageSearchQuery, body({ q: "x".repeat(500,), },),),
    ).toBe(true,);
  });

  test("rejects q above the maximum (501 chars)", () => {
    expect(
      Value.Check(MessageSearchQuery, body({ q: "x".repeat(501,), },),),
    ).toBe(false,);
  });

  test("accepts limit=100 (max)", () => {
    expect(Value.Check(MessageSearchQuery, body({ limit: 100, },),),).toBe(true,);
  });

  test("rejects limit=101", () => {
    expect(Value.Check(MessageSearchQuery, body({ limit: 101, },),),).toBe(false,);
  });

  test("accepts offset=0 (min)", () => {
    expect(Value.Check(MessageSearchQuery, body({ offset: 0, },),),).toBe(true,);
  });

  test("rejects offset=-1 (below min)", () => {
    expect(Value.Check(MessageSearchQuery, body({ offset: -1, },),),).toBe(false,);
  });

  test("hasAttachment accepts only the strings 'true' or 'false'", () => {
    expect(
      Value.Check(MessageSearchQuery, body({ hasAttachment: "true", },),),
    ).toBe(true,);
    expect(
      Value.Check(MessageSearchQuery, body({ hasAttachment: "false", },),),
    ).toBe(true,);
    // Booleans rejected — must be the strings.
    expect(
      Value.Check(MessageSearchQuery, body({ hasAttachment: true as unknown as string, },),),
    ).toBe(false,);
  });

  test("dateFrom/dateTo accept arbitrary strings (no ISO format check)", () => {
    // Pin: no format validation. Downstream SQL is responsible for date
    // parsing; bad dates likely surface as SQL errors.
    expect(
      Value.Check(MessageSearchQuery, body({ dateFrom: "not-a-date", },),),
    ).toBe(true,);
  });
},);
