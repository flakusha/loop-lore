// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import {
  extractGameStateBlock,
  extractGameStateBlocks,
} from "./game-state";

describe("extractGameStateBlock", () => {
  it("extracts the payload of a valid block", () => {
    const payload = '{"grid":{"width":8,"height":6}}';
    const content = `narration\n\`\`\`game-state\n${payload}\n\`\`\`\nmore`;
    expect(extractGameStateBlock(content,),).toBe(payload,);
  });

  it("trims the inner payload", () => {
    expect(extractGameStateBlock('```game-state\n\n  {"a":1}  \n\n```',),).toBe(
      '{"a":1}',
    );
  });

  it("returns null when no block is present", () => {
    expect(extractGameStateBlock("no fences here",),).toBeNull();
  });

  it("does not match other-language fences mentioning game-state", () => {
    const content = "```json\nthe word game-state appears\n```";
    expect(extractGameStateBlock(content,),).toBeNull();
  });

  it("returns the first block only", () => {
    const content = [
      '```game-state\n{"first":true}\n```',
      '```game-state\n{"second":true}\n```',
    ].join("\n",);
    expect(extractGameStateBlock(content,),).toBe('{"first":true}',);
  });

  it("finds blocks at start, middle, and end", () => {
    expect(extractGameStateBlock("```game-state\n{}\n```",),).toBe("{}",);
    expect(extractGameStateBlock("pre\n```game-state\n{}\n```\npost",),).toBe("{}",);
    expect(extractGameStateBlock("pre\n```game-state\n{}\n```",),).toBe("{}",);
  });

  it("returns empty string for an empty payload", () => {
    expect(extractGameStateBlock("```game-state\n```",),).toBe("",);
  });
});

describe("extractGameStateBlocks", () => {
  it("returns every payload in order", () => {
    const content = [
      '```game-state\n{"n":1}\n```',
      "text",
      '```game-state\n{"n":2}\n```',
    ].join("\n",);
    expect(extractGameStateBlocks(content,),).toEqual([
      '{"n":1}',
      '{"n":2}',
    ],);
  });

  it("returns an empty array when no block is present", () => {
    expect(extractGameStateBlocks("```json\nnope\n```",),).toEqual([],);
  });
});
