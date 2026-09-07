import { describe, expect, it, } from "bun:test";
import { compress, type CompressionOptions, decompress, withCompression, } from "./compression";

describe("transport/compression (real logic)", () => {
  it("withCompression exports a ProtocolHandler wrapper", () => {
    const inner = {
      connect: async () => ({ metadata: {}, }),
      send: async () => {},
      get: async () => "",
      close: async () => {},
    };
    const wrapper = withCompression({ handler: inner as any, algorithm: "none", options: {}, },);
    expect(typeof wrapper.connect,).toBe("function",);
  });
  it("compress passes through data below threshold", () => {
    const small = new Uint8Array([1, 2, 3,],);
    const opts: CompressionOptions = { threshold: 256, };
    const result = (compress as any)(small, "none", opts,);
    expect(result,).toBe(small,);
  });
  it("decompress handles none algorithm", () => {
    const data = new Uint8Array([1, 2, 3,],);
    const result = (decompress as any)(data, "none",);
    expect(result.length,).toBe(3,);
  });
});
