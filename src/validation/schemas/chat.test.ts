// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat update schema regression tests.
 *
 * Bug: BUG-promptoverride-schema-has-no-maxlength-token-bomb-storage-ve
 *
 * `promptOverride` previously accepted an unbounded string; a client could
 * PUT an arbitrarily large value stored in `chats.prompt_override` and
 * injected into the system prompt on every generation (token bomb). The
 * field is now capped (20k chars); null still clears it.
 */

import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import {
  BatchIdsBody,
  ChatCreateBody,
  ChatMarkReadBody,
  ChatParticipantUpdateBody,
  ChatUpdateBody,
} from "./chat";

/**
 * @param promptOverride
 */
function bodyWith(promptOverride: unknown,) {
  return { promptOverride, };
}

/**
 * Top-level body helper used by every describe below.
 * @param fields
 */
function body(fields: Record<string, unknown>,) {
  return fields;
}

describe("ChatUpdateBody.promptOverride", () => {
  test("accepts a null override (clear)", () => {
    expect(Value.Check(ChatUpdateBody, bodyWith(null),),).toBe(true,);
  });

  test("accepts an override at the 20k cap", () => {
    expect(Value.Check(ChatUpdateBody, bodyWith("x".repeat(20_000,),),),).toBe(true,);
  });

  test("rejects an override above the cap", () => {
    expect(Value.Check(ChatUpdateBody, bodyWith("x".repeat(20_001,),),),).toBe(false,);
  });
});


describe("ChatUpdateBody — additional field edge cases", () => {

  test("promptOverride accepts an empty string", () => {
    // t.String with maxLength but no minLength → "" is valid. Pin this:
    // clients may legitimately clear the override with "" instead of null.
    expect(Value.Check(ChatUpdateBody, body({ promptOverride: "", },),),).toBe(true,);
  });

  test("customInstructions accepts exactly 5000 chars (the cap)", () => {
    expect(
      Value.Check(ChatUpdateBody, body({ customInstructions: "x".repeat(5000,), },),),
    ).toBe(true,);
  });

  test("customInstructions rejects 5001 chars", () => {
    expect(
      Value.Check(ChatUpdateBody, body({ customInstructions: "x".repeat(5001,), },),),
    ).toBe(false,);
  });

  test("customInstructions accepts null (clear)", () => {
    expect(Value.Check(ChatUpdateBody, body({ customInstructions: null, },),),).toBe(true,);
  });

  test("outputStylePreset accepts the empty-string literal", () => {
    // Schema explicitly allows "" — pin it. Means "unset / no preset".
    expect(Value.Check(ChatUpdateBody, body({ outputStylePreset: "", },),),).toBe(true,);
  });

  test("outputStylePreset rejects case-mismatched literals", () => {
    // Pin: literals are case-sensitive. "Neutral" with capital N must fail.
    expect(Value.Check(ChatUpdateBody, body({ outputStylePreset: "Neutral", },),),).toBe(false,);
    expect(Value.Check(ChatUpdateBody, body({ outputStylePreset: "HIGH_FANTASY", },),),).toBe(false,);
  });

  test("outputStylePreset rejects unknown strings", () => {
    expect(Value.Check(ChatUpdateBody, body({ outputStylePreset: "pirate", },),),).toBe(false,);
  });

  test("thinkingVisibility rejects unknown strings", () => {
    expect(Value.Check(ChatUpdateBody, body({ thinkingVisibility: "always", },),),).toBe(false,);
  });

  test("renderingOverride rejects unknown strings", () => {
    // Only "text", "visual_novel", or null. Pin that "markdown" / "html" / "vn" fail.
    expect(Value.Check(ChatUpdateBody, body({ renderingOverride: "markdown", },),),).toBe(false,);
    expect(Value.Check(ChatUpdateBody, body({ renderingOverride: "html", },),),).toBe(false,);
    expect(Value.Check(ChatUpdateBody, body({ renderingOverride: "vn", },),),).toBe(false,);
  });

  test("renderingOverride accepts null", () => {
    expect(Value.Check(ChatUpdateBody, body({ renderingOverride: null, },),),).toBe(true,);
  });

  test("quickReplies accepts items with empty label and empty command", () => {
    // t.String without minLength → "" is valid. Pin this contract:
    // a degenerate quick reply with empty fields passes validation here.
    // Downstream code (assistant commands) is responsible for rejecting
    // empty commands at execution time, not at request validation.
    expect(
      Value.Check(ChatUpdateBody, body({
        quickReplies: [{ label: "", command: "", },],
      },),),
    ).toBe(true,);
  });

  test("quickReplies rejects items with an unknown trigger value", () => {
    expect(
      Value.Check(ChatUpdateBody, body({
        quickReplies: [{ label: "x", command: "y", trigger: "system", },],
      },),),
    ).toBe(false,);
  });

  test("quickReplies accepts items without trigger (optional)", () => {
    expect(
      Value.Check(ChatUpdateBody, body({
        quickReplies: [{ label: "x", command: "y", },],
      },),),
    ).toBe(true,);
  });

  test("quickReplies accepts a large array (no maxItems cap)", () => {
    // Pin the lack of maxItems: 1000-item arrays are accepted at the
    // validation layer. Downstream rendering/UI must enforce its own cap.
    const many = Array.from({ length: 1000, }, (_, i,) => ({
      label: `q${i}`,
      command: `cmd${i}`,
    }),);
    expect(Value.Check(ChatUpdateBody, body({ quickReplies: many, },),),).toBe(true,);
  });

  test("quickReplies accepts null (clear)", () => {
    expect(Value.Check(ChatUpdateBody, body({ quickReplies: null, },),),).toBe(true,);
  });

  test("name accepts exactly 255 chars (Name primitive max)", () => {
    expect(Value.Check(ChatUpdateBody, body({ name: "x".repeat(255,), },),),).toBe(true,);
  });

  test("name rejects 256 chars", () => {
    expect(Value.Check(ChatUpdateBody, body({ name: "x".repeat(256,), },),),).toBe(false,);
  });

  test("name rejects empty string (Name minLength 1)", () => {
    expect(Value.Check(ChatUpdateBody, body({ name: "", },),),).toBe(false,);
  });

  test("name_source accepts arbitrary string (no constraint)", () => {
    // Pin: t.Optional(t.String()) without minLength/maxLength/format means
    // this is effectively a free-form string field. Pin the contract so a
    // future tightening is explicit, not silent.
    expect(
      Value.Check(ChatUpdateBody, body({ name_source: "user.manual", },),),
    ).toBe(true,);
    expect(
      Value.Check(ChatUpdateBody, body({ name_source: "x".repeat(10_000,), },),),
    ).toBe(true,);
  });
},);

describe("ChatCreateBody — field edge cases", () => {
  test("participantIds accepts an empty array (no minItems)", () => {
    // Pin: empty participantIds is valid at validation time. Downstream
    // route handler is responsible for rejecting chats with zero participants.
    expect(
      Value.Check(ChatCreateBody, body({ name: "ok", participantIds: [], },),),
    ).toBe(true,);
  });

  test("participantIds accepts an array of arbitrary strings", () => {
    // No format constraint on items (unlike Id which uses UUID format).
    expect(
      Value.Check(ChatCreateBody, body({
        name: "ok",
        participantIds: ["alice", "bob", "carol",],
      },),),
    ).toBe(true,);
  });

  test("memoryCarry rejects unknown values", () => {
    expect(
      Value.Check(ChatCreateBody, body({ name: "ok", memoryCarry: "partial", },),),
    ).toBe(false,);
  });

  test("encryptionLevel rejects unknown tiers", () => {
    expect(
      Value.Check(ChatCreateBody, body({ name: "ok", encryptionLevel: "military", },),),
    ).toBe(false,);
  });

  test("encryptionLevel accepts the three documented tiers", () => {
    for (const lvl of ["none", "standard", "private",]) {
      expect(Value.Check(ChatCreateBody, body({ name: "ok", encryptionLevel: lvl, },),),).toBe(
        true,
      );
    }
  });

  test("templateId rejects empty string (minLength 1)", () => {
    expect(
      Value.Check(ChatCreateBody, body({ name: "ok", templateId: "", },),),
    ).toBe(false,);
  });
},);

describe("ChatParticipantUpdateBody — talkativity boundary", () => {
  test("talkativity accepts 1 (lower bound)", () => {
    expect(
      Value.Check(ChatParticipantUpdateBody, body({ talkativity: 1, },),),
    ).toBe(true,);
  });

  test("talkativity accepts 10 (upper bound)", () => {
    expect(
      Value.Check(ChatParticipantUpdateBody, body({ talkativity: 10, },),),
    ).toBe(true,);
  });

  test("talkativity rejects 0 (below minimum)", () => {
    expect(
      Value.Check(ChatParticipantUpdateBody, body({ talkativity: 0, },),),
    ).toBe(false,);
  });

  test("talkativity rejects 11 (above maximum)", () => {
    expect(
      Value.Check(ChatParticipantUpdateBody, body({ talkativity: 11, },),),
    ).toBe(false,);
  });

  test("talkativity rejects non-integer (0.5)", () => {
    // Pin: t.Numeric in Elysia/TypeBox coerces to integer on validation
    // even without explicit `multipleOf: 1`. 0.5 is rejected. (This
    // surprised me — the schema doesn't declare integer, but TypeBox's
    // t.Numeric rejects non-integers by default in this version.)
    expect(
      Value.Check(ChatParticipantUpdateBody, body({ talkativity: 0.5, },),),
    ).toBe(false,);
  });

  test("talkativity accepts integer 5 (middle of range)", () => {
    expect(
      Value.Check(ChatParticipantUpdateBody, body({ talkativity: 5, },),),
    ).toBe(true,);
  });

  test("talkativity rejects negative (-1)", () => {
    expect(
      Value.Check(ChatParticipantUpdateBody, body({ talkativity: -1, },),),
    ).toBe(false,);
  });

  test("talkativity COERCES string '5' to numeric (Elysia default behavior)", () => {
    // Pin: Elysia's @sinclair/typebox integration coerces numeric strings
    // by default. Clients sending "5" pass validation; this is consistent
    // with Elysia's standard JSON coercion policy but worth knowing.
    expect(
      Value.Check(ChatParticipantUpdateBody, body({ talkativity: "5", },),),
    ).toBe(true,);
  });

  test("talkativity accepts out-of-range string '15' (TypeBox quirk: range only enforced on number type)", () => {
    // REAL FINDING: t.Numeric in @sinclair/typebox uses TypeGuard semantics
    // for Value.Check — strings pass the "is numeric?" check but bypass
    // the minimum/maximum constraints (which are only applied to actual
    // number values). A client sending talkativity: "15" passes validation
    // but would fail downstream if the handler coerces — or worse, write
    // "15" to the DB as a string. Pin this behavior; a future migration
    // to Elysia's stricter coercion (Value.Cast) should be deliberate.
    expect(
      Value.Check(ChatParticipantUpdateBody, body({ talkativity: "15", },),),
    ).toBe(true,);
  });

  test("talkativity rejects non-numeric string 'abc'", () => {
    expect(
      Value.Check(ChatParticipantUpdateBody, body({ talkativity: "abc", },),),
    ).toBe(false,);
  });
},);

describe("ChatMarkReadBody / BatchIdsBody — required-field contracts", () => {
  test("ChatMarkReadBody rejects empty messageId", () => {
    expect(Value.Check(ChatMarkReadBody, body({ messageId: "", },),),).toBe(false,);
  });

  test("ChatMarkReadBody rejects missing messageId", () => {
    expect(Value.Check(ChatMarkReadBody, body({},),),).toBe(false,);
  });

  test("BatchIdsBody rejects empty ids array", () => {
    expect(Value.Check(BatchIdsBody, body({ ids: [], },),),).toBe(false,);
  });

  test("BatchIdsBody accepts a single-item ids array", () => {
    expect(Value.Check(BatchIdsBody, body({ ids: ["one",], },),),).toBe(true,);
  });
},);
