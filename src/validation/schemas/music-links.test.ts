// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Music Links schema regression tests.
 *
 * Bug: BUG-music-links-post-body-chatid-is-required-but-ignored-dead-sc
 *
 * MusicLinkCreateBody must NOT accept a `chatId` field. The chat is the
 * route param `id`; the only authoritative source. A separate body field
 * invited mismatches where the handler stored against the param while
 * consumers believed they wrote to body.chatId.
 */

import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import { MusicLinkCreateBody, } from "./music-links";

const UUID_A = "550e8400-e29b-41d4-a716-446655440000";

describe("MusicLinkCreateBody", () => {
  test("accepts a body with only url and sectionId (uuid)", () => {
    const body = {
      url: "https://open.spotify.com/track/abc",
      sectionId: UUID_A,
    };
    expect(Value.Check(MusicLinkCreateBody, body,)).toBe(true,);
  });

  test("accepts a body without sectionId (optional)", () => {
    const body = {
      url: "https://open.spotify.com/track/abc",
    };
    expect(Value.Check(MusicLinkCreateBody, body,)).toBe(true,);
  });

  test("strips chatId from body if supplied (field no longer in contract)", () => {
    const body = {
      url: "https://open.spotify.com/track/abc",
      chatId: "chat-other",
    };
    // Value.Clean drops keys that are not part of the schema. The
    // resulting object must NOT carry `chatId`; consumers should not be
    // able to round-trip a chat id through the body even if they
    // supply one.
    const cleaned = Value.Clean(MusicLinkCreateBody, body,);
    expect((cleaned as Record<string, unknown>).chatId,).toBeUndefined();
    expect(Value.Check(MusicLinkCreateBody, cleaned,)).toBe(true,);
  });

  test("rejects a body missing url (required)", () => {
    const body = {
      sectionId: UUID_A,
    };
    expect(Value.Check(MusicLinkCreateBody, body,)).toBe(false,);
  });

  test("rejects a body with non-uri url", () => {
    const body = {
      url: "not-a-url",
    };
    expect(Value.Check(MusicLinkCreateBody, body,)).toBe(false,);
  });

  // ── Edge cases ────────────────────────────────────────────────

  test("rejects an empty url string", () => {
    expect(Value.Check(MusicLinkCreateBody, { url: "", },),).toBe(false,);
  });

  test("rejects a 100 KB url (TypeBox maxLength on format:uri)", () => {
    // TypeBox enforces a default maximum length on URI strings; an
    // oversize url must be rejected rather than accepted silently.
    const longPath = "a".repeat(100_000,);
    const longUrl = `https://example.com/${longPath}`;
    expect(Value.Check(MusicLinkCreateBody, { url: longUrl, },),).toBe(false,);
  });

  test("rejects a url containing an embedded NUL control character", () => {
    // Control characters must not be silently accepted as part of a URI.
    expect(
      Value.Check(MusicLinkCreateBody, { url: "https://example.com/\u0000bad", },),
    ).toBe(false,);
  });

  test("rejects a url containing a literal newline control character", () => {
    expect(
      Value.Check(MusicLinkCreateBody, { url: "https://example.com/\nbad", },),
    ).toBe(false,);
  });

  test.each([
    ["number url", 42,],
    ["array url", ["https://example.com",],],
    ["object url", { href: "https://example.com", },],
    ["null url", null,],
    ["boolean url", true,],
  ])("rejects non-string url values (%s)", (_label, badUrl,) => {
    expect(Value.Check(MusicLinkCreateBody, { url: badUrl as unknown as string, },),).toBe(false,);
  });

  test("rejects a url with mailto: scheme (no host)", () => {
    // mailto has no URI host; TypeBox's URI regex rejects it.
    expect(
      Value.Check(MusicLinkCreateBody, { url: "mailto:[email protected]", },),
    ).toBe(false,);
  });

  test("accepts an http (non-https) url", () => {
    expect(
      Value.Check(MusicLinkCreateBody, { url: "http://example.com/track/1", },),
    ).toBe(true,);
  });

  test("rejects a body with non-uuid sectionId", () => {
    expect(
      Value.Check(MusicLinkCreateBody, { sectionId: "not-a-uuid", url: "https://example.com", },),
    ).toBe(false,);
  });

  test("accepts an uppercase sectionId uuid (UUIDs are case-insensitive)", () => {
    // UUIDs are case-insensitive per RFC 4122 §3; the OptionalId helper
    // uses a case-insensitive validator.
    expect(
      Value.Check(
        MusicLinkCreateBody,
        { url: "https://example.com", sectionId: UUID_A.toUpperCase(), },
      ),
    ).toBe(true,);
  });

  test("strips extra unknown keys from a valid body via Value.Clean", () => {
    const body = {
      url: "https://example.com/track",
      sectionId: UUID_A,
      chatId: "chat-x",
      chatId2: "chat-y",
      debug: true,
      nested: { evil: "yes", },
    };
    const cleaned = Value.Clean(MusicLinkCreateBody, body,) as { url?: string; sectionId?: string };
    expect(Object.keys(cleaned,).sort(),).toEqual(["sectionId", "url",]);
    expect(Value.Check(MusicLinkCreateBody, cleaned,)).toBe(true,);
  });

  test("rejects a body that is an empty object (url is required)", () => {
    expect(Value.Check(MusicLinkCreateBody, {},),).toBe(false,);
  });

  test("rejects a body that is null", () => {
    expect(Value.Check(MusicLinkCreateBody, null as unknown as object,)).toBe(false,);
  });
});
