/**
 * Unit tests for PNG steganography character-card reader.
 */

import { describe, expect, test, } from "bun:test";
import { deflateSync, } from "node:zlib";
import { extractCharacterDataFromPng, } from "./steganography";

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10,],);

function crc(_type: string, _data: Buffer,): Buffer {
  return Buffer.alloc(4,);
}

function pngChunk(type: string, data: Buffer,): Buffer {
  const len = Buffer.alloc(4,);
  len.writeUInt32BE(data.length, 0,);
  const typeBuf = Buffer.from(type, "ascii",);
  return Buffer.concat([len, typeBuf, data, crc(type, data,),],);
}

function pngWithTextChunk(type: string, keyword: string, text: string,): Buffer {
  const keyBuf = Buffer.from(keyword, "latin1",);
  const nullByte = Buffer.from([0,],);
  let chunkData: Buffer;

  if (type === "tEXt") {
    chunkData = Buffer.from(`${keyword  }\u{0}${  text}`, "latin1",);
  } else if (type === "zTXt") {
    const compressed = deflateSync(Buffer.from(text, "utf8",),);
    chunkData = Buffer.concat([keyBuf, nullByte, Buffer.from([0,],), compressed,],);
  } else {
    // iTXt: keyword \u0000 compressionFlag(0) lang \u0000 translatedKey \u0000 text
    chunkData = Buffer.concat([keyBuf, nullByte, Buffer.from([0, 0,],), nullByte, Buffer.from(text, "utf8",),],);
  }

  return Buffer.concat([PNG_SIG, pngChunk(type, chunkData,),],);
}

function makeV2Card(name: string, spec = "chara_card_v2",): unknown {
  return {
    spec,
    data: {
      name,
      description: `Test ${name}`,
      personality: "friendly",
      scenario: "",
      first_mes: "Hello!",
      mes_example: "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      character_version: "1.0",
      creator: "Tester",
      tags: [],
      extensions: {},
    },
  };
}

describe("extractCharacterDataFromPng", () => {
  test("returns null for non-PNG buffer", () => {
    const buf = Buffer.from("not a png", "ascii",);
    expect(extractCharacterDataFromPng(buf,),).toBeNull();
  });

  test("returns null for buffer shorter than PNG signature", () => {
    const buf = Buffer.alloc(4,);
    expect(extractCharacterDataFromPng(buf,),).toBeNull();
  });

  test("extracts base64-encoded JSON from tEXt chunk", () => {
    const card = makeV2Card("Alaric",);
    const b64 = Buffer.from(JSON.stringify(card,), "utf8",).toString("base64",);
    const png = pngWithTextChunk("tEXt", "chara", b64,);
    const result = extractCharacterDataFromPng(png,);
    expect(result,).not.toBeNull();
    expect(result!.spec,).toBe("chara_card_v2",);
    expect((result!.data as { name: string }).name,).toBe("Alaric",);
  });

  test("extracts raw JSON from tEXt chunk (non-base64 fallback)", () => {
    const card = makeV2Card("Bella",);
    const raw = JSON.stringify(card,);
    const png = pngWithTextChunk("tEXt", "chara", raw,);
    const result = extractCharacterDataFromPng(png,);
    expect(result,).not.toBeNull();
    expect((result!.data as { name: string }).name,).toBe("Bella",);
  });

  test("extracts data from zTXt chunk (deflate-compressed text)", () => {
    const card = makeV2Card("Celeste",);
    const raw = JSON.stringify(card,);
    const keyBuf = Buffer.from("chara", "latin1",);
    const nullByte = Buffer.from([0,],);
    const compressed = deflateSync(Buffer.from(raw, "latin1",),);
    const chunkData = Buffer.concat([keyBuf, nullByte, Buffer.from([0,],), compressed,],);
    const png = Buffer.concat([PNG_SIG, pngChunk("zTXt", chunkData,),],);
    const result = extractCharacterDataFromPng(png,);
    expect(result,).not.toBeNull();
    expect((result!.data as { name: string }).name,).toBe("Celeste",);
  });

  test("extracts data from uncompressed iTXt chunk", () => {
    const card = makeV2Card("Dorian",);
    const raw = JSON.stringify(card,);
    const png = pngWithTextChunk("iTXt", "chara", raw,);
    const result = extractCharacterDataFromPng(png,);
    expect(result,).not.toBeNull();
    expect(result!.spec,).toBe("chara_card_v2",);
    expect((result!.data as { name: string }).name,).toBe("Dorian",);
  });

  test("handles zTXt with deflate garbage gracefully", () => {
    const keyBuf = Buffer.from("chara", "latin1",);
    const nullByte = Buffer.from([0,],);
    const chunkData = Buffer.concat([keyBuf, nullByte, Buffer.from([0,],), Buffer.from([0xFF, 0xFF, 0xFF,],),],);
    const png = Buffer.concat([PNG_SIG, pngChunk("zTXt", chunkData,),],);
    expect(extractCharacterDataFromPng(png,),).toBeNull();
  });

  test("skips non-text chunks (IHDR, IDAT, PLTE)", () => {
    const png = Buffer.concat([
      PNG_SIG,
      pngChunk("IHDR", Buffer.alloc(13,),),
      pngChunk("IDAT", Buffer.alloc(4,),),
      pngChunk("PLTE", Buffer.alloc(3,),),
    ],);
    expect(extractCharacterDataFromPng(png,),).toBeNull();
  });

  test("handles chunk truncated mid-data", () => {
    const png = Buffer.concat([
      PNG_SIG,
      pngChunk("tEXt", Buffer.from("chara\u{0}partial", "latin1",),),
      Buffer.from([0, 0, 0, 3, 0x74, 0x45,],), // truncated next chunk
    ],);
    const result = extractCharacterDataFromPng(png,);
    expect(result,).toBeNull();
  });

  test("extracts V2 card with data at root (no spec)", () => {
    const datum = { name: "Elara", description: "elf", };
    const raw = JSON.stringify(datum,);
    const png = pngWithTextChunk("tEXt", "chara", raw,);
    const result = extractCharacterDataFromPng(png,);
    expect(result,).not.toBeNull();
    expect(result!.spec,).toBeUndefined();
    expect((result!.data as { name: string }).name,).toBe("Elara",);
  });

  test("base64 decode failure uses raw text fallback", () => {
    const card = makeV2Card("Fenrir",);
    const raw = JSON.stringify(card,);
    // "zzzz" is not valid base64, but raw JSON is used directly
    const png = pngWithTextChunk("tEXt", "chara", raw,);
    const result = extractCharacterDataFromPng(png,);
    expect(result,).not.toBeNull();
    expect((result!.data as { name: string }).name,).toBe("Fenrir",);
  });

  test("returns null when text is not valid JSON", () => {
    const png = pngWithTextChunk("tEXt", "chara", "gibberish{notjson",);
    expect(extractCharacterDataFromPng(png,),).toBeNull();
  });
});
