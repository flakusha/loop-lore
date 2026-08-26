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
    expect(Value.Check(MusicLinkCreateBody, body,)).toBe(true);
  });

  test("accepts a body without sectionId (optional)", () => {
    const body = {
      url: "https://open.spotify.com/track/abc",
    };
    expect(Value.Check(MusicLinkCreateBody, body,)).toBe(true);
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
    const cleaned = Value.Clean(MusicLinkCreateBody, body);
    expect((cleaned as Record<string, unknown>).chatId).toBeUndefined();
    expect(Value.Check(MusicLinkCreateBody, cleaned,)).toBe(true);
  });

  test("rejects a body missing url (required)", () => {
    const body = {
      sectionId: UUID_A,
    };
    expect(Value.Check(MusicLinkCreateBody, body,)).toBe(false);
  });

  test("rejects a body with non-uri url", () => {
    const body = {
      url: "not-a-url",
    };
    expect(Value.Check(MusicLinkCreateBody, body,)).toBe(false);
  });
});