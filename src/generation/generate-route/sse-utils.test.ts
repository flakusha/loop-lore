/**
 * SSE Utils Tests
 *
 * Pins SSE framing, HTML escaping, and tool-block rendering.
 */
import { describe, expect, it, } from "bun:test";
import { escapeHtml, renderToolCallBlock, sseData, } from "./sse-utils.js";

describe("sseData", () => {
  it("frames JSON as an SSE data block", () => {
    expect(sseData({ type: "x", },),).toBe(`data: {"type":"x"}\n\n`,);
  });
});

describe("escapeHtml", () => {
  it("escapes all five special characters", () => {
    expect(escapeHtml(`<a href="x">&'`,),).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;",);
  });
  it("leaves plain text untouched", () => {
    expect(escapeHtml("plain",),).toBe("plain",);
  });
});

describe("renderToolCallBlock", () => {
  it("renders an escaped collapsible block", () => {
    const html = renderToolCallBlock("<tool>", `{"a":"<b>"}`,);
    expect(html,).toInclude("&lt;tool&gt;",);
    expect(html,).toInclude("&lt;b&gt;",);
    expect(html,).toInclude("tool-call-block",);
  });
});
