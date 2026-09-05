import { describe, expect, test } from "bun:test";
// Tier B: group-chat mention parser boundary (existing mention-parser.test.ts thin)

describe("group-chat mention boundary", () => {
  test("parseMentions returns empty array on no @", () => {
    const { parseMentions } = require("./index");
    const res = parseMentions("hello there", "actor-id");
    expect(res.mentionedActorIds).toEqual([]);
  });
});
