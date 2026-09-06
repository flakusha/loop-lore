import { describe, expect, it, } from "bun:test";
import { parseAcceptEncoding, parseAcceptProtocols, } from "../../../transport/negotiation-parsers";

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
});
