import { describe, expect, it, } from "bun:test";
import { deriveSearchTokens, TOKEN_HEX_LENGTH, tokenizeForSearch, } from "./encrypted-tokens";

describe("search/encrypted-tokens (tokenizer)", () => {
  it("lowercases, drops short words, dedupes in first-seen order", () => {
    expect(tokenizeForSearch("Hello, hello tavern! a of",),).toEqual(["hello", "tavern",],);
  });
  it("returns empty for punctuation-only input", () => {
    expect(tokenizeForSearch("… !!!",),).toEqual([],);
  });
});

describe("search/encrypted-tokens (HMAC derivation)", () => {
  it("is deterministic for same plaintext and key", async () => {
    const a = await deriveSearchTokens("tavern song", "user-key-1",);
    const b = await deriveSearchTokens("tavern song", "user-key-1",);
    expect(a,).toEqual(b,);
    expect(a,).toHaveLength(2,);
    for (const t of a) { expect(t,).toHaveLength(TOKEN_HEX_LENGTH,); }
  });
  it("isolates users: different keys give different tokens", async () => {
    const a = await deriveSearchTokens("tavern song", "user-key-1",);
    const b = await deriveSearchTokens("tavern song", "user-key-2",);
    expect(a,).not.toEqual(b,);
  });
  it("returns empty for empty plaintext and rejects empty key", () => {
    expect(deriveSearchTokens("", "user-key-1",),).resolves.toEqual([],);
    expect(deriveSearchTokens("tavern", "",),).rejects.toThrow();
  });
});
