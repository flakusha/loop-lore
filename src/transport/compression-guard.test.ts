import { describe, expect, it, } from "bun:test";
import { SafeBufferError, } from "../utils/safe-buffer";
import { compress, decompress, } from "./compression";

// One byte past the safe-buffer cap (10 MB) so the size guard fires.
const OVERSIZED = 10_485_761;

describe("transport/compression size guard", () => {
  it("compress rejects a payload larger than the safe buffer cap", () => {
    const big = new Uint8Array(OVERSIZED,);
    expect(() => compress(big, "gzip", { threshold: 1, },)).toThrow(SafeBufferError,);
  });

  it("decompress rejects a payload larger than the safe buffer cap", () => {
    const big = new Uint8Array(OVERSIZED,);
    expect(() => decompress(big, "gzip",)).toThrow(SafeBufferError,);
  });
});
