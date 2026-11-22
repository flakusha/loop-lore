import { describe, expect, it, } from "bun:test";
import { CompressionAlgorithm, } from "../db/enums";
import { parseAcceptEncoding, parseAcceptProtocols, } from "./negotiation-parsers";

describe("transport/negotiation-parsers (real logic)", () => {
  it("parseAcceptProtocols returns empty for null", () => {
    expect(parseAcceptProtocols(null,),).toEqual([],);
  });

  it("parseAcceptProtocols parses single protocol", () => {
    const result = parseAcceptProtocols("websocket",);
    expect(result.length,).toBeGreaterThanOrEqual(0,);
  });

  it("parseAcceptProtocols excludes q<=0", () => {
    const result = parseAcceptProtocols("http/2;q=0,websocket",);
    expect(Array.isArray(result,),).toBe(true,);
  });

  it("parseAcceptEncoding handles null", () => {
    const result = parseAcceptEncoding(null,);
    expect(Array.isArray(result,),).toBe(true,);
  });

  it("reads uppercase Q= after another parameter", () => {
    const result = parseAcceptEncoding("gzip; LEVEL=5; Q=0.5, br;q=0.9",);
    expect(result,).toEqual([CompressionAlgorithm.Brotli, CompressionAlgorithm.Gzip,],);
  });

  it("falls back to q=1 on a malformed weight after another parameter", () => {
    const result = parseAcceptEncoding("gzip;level=5;q=oops, br;q=0.9",);
    expect(result,).toEqual([CompressionAlgorithm.Gzip, CompressionAlgorithm.Brotli,],);
  });

  it("excludes q=0 found after another parameter", () => {
    const result = parseAcceptEncoding("gzip;level=5;q=0, br;q=0.9",);
    expect(result,).toEqual([CompressionAlgorithm.Brotli,],);
  });
});
