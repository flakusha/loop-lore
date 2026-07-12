// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the dynamic-response optimization policy.
 * Constructs Responses and asserts minify / validate / compress behavior.
 */

import { describe, test, expect } from "bun:test";
import { gunzipSync, brotliDecompressSync } from "node:zlib";
import { DynamicResponsePolicy } from "./dynamic-response";
import type { DynamicResponseConfig } from "../config/schema";
import type { Logger } from "../logger";

function makeConfig(overrides: Partial<DynamicResponseConfig> = {}): DynamicResponseConfig {
  return {
    enabled: true,
    minify: true,
    validate: true,
    compress: true,
    compressAlgorithm: "auto",
    compressThreshold: 512,
    ...overrides,
  };
}

interface WarnCall {
  message: string | Record<string, unknown>;
}

function makeLogger(): { logger: Logger; warns: WarnCall[] } {
  const warns: WarnCall[] = [];
  const noop = (): void => {
    /* intentionally empty */
  };
  const logger = {
    debug: noop,
    info: noop,
    warn(message: string | Record<string, unknown>) {
      warns.push({ message });
    },
    error: noop,
    child() {
      return logger;
    },
  } as unknown as Logger;
  return { logger, warns };
}

function htmlResponse(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function req(acceptEncoding = ""): Request {
  const headers = new Headers();
  if (acceptEncoding) headers.set("accept-encoding", acceptEncoding);
  return new Request("http://localhost/dynamic/test", { headers });
}

describe("DynamicResponsePolicy — minify", () => {
  test("strips whitespace and comments from HTML", async () => {
    const { logger } = makeLogger();
    const policy = new DynamicResponsePolicy(makeConfig({ compress: false }), logger);
    const body = `<div>\n  <!-- comment -->\n   <span>hi</span>\n</div>`;
    const result = await policy.apply({ request: req(), response: htmlResponse(body) });
    const out = await result.text();
    expect(out).not.toContain("<!-- comment -->");
    expect(out.length).toBeLessThan(body.length);
    expect(out).toContain("<span>hi</span>");
  });

  test("passthrough when disabled", async () => {
    const { logger } = makeLogger();
    const policy = new DynamicResponsePolicy(makeConfig({ enabled: false }), logger);
    const body = `<div>   spaced   </div>`;
    const result = await policy.apply({ request: req(), response: htmlResponse(body) });
    expect(await result.text()).toBe(body);
  });

  test("ignores non-allowlisted content types", async () => {
    const { logger } = makeLogger();
    const policy = new DynamicResponsePolicy(makeConfig(), logger);
    const res = new Response("binary", { headers: { "Content-Type": "image/png" } });
    const result = await policy.apply({ request: req("br"), response: res });
    expect(result.headers.has("Content-Encoding")).toBe(false);
  });
});

describe("DynamicResponsePolicy — validate", () => {
  test("logs warning and serves original on invalid JS", async () => {
    const { logger, warns } = makeLogger();
    const policy = new DynamicResponsePolicy(makeConfig({ compress: false }), logger);
    const broken = `const x = (`;
    const res = new Response(broken, { headers: { "Content-Type": "application/javascript" } });
    const result = await policy.apply({ request: req(), response: res });
    expect(await result.text()).toBe(broken);
    expect(warns.length).toBe(1);
  });

  test("validate-only mode preserves original body but still parses", async () => {
    const { logger, warns } = makeLogger();
    const policy = new DynamicResponsePolicy(
      makeConfig({ minify: false, validate: true, compress: false }),
      logger,
    );
    const body = `<div>  keep  spaces  </div>`;
    const result = await policy.apply({ request: req(), response: htmlResponse(body) });
    expect(await result.text()).toBe(body);
    expect(warns.length).toBe(0);
  });
});

describe("DynamicResponsePolicy — compress", () => {
  const big = `<div>${"x".repeat(2000)}</div>`;

  test("gzip when client accepts gzip only", async () => {
    const { logger } = makeLogger();
    const policy = new DynamicResponsePolicy(makeConfig({ minify: false }), logger);
    const result = await policy.apply({ request: req("gzip"), response: htmlResponse(big) });
    expect(result.headers.get("Content-Encoding")).toBe("gzip");
    expect(result.headers.get("Vary")).toContain("Accept-Encoding");
    const buf = Buffer.from(await result.arrayBuffer());
    expect(gunzipSync(buf).toString("utf8")).toBe(big);
  });

  test("prefers br under auto when client accepts br", async () => {
    const { logger } = makeLogger();
    const policy = new DynamicResponsePolicy(makeConfig({ minify: false }), logger);
    const result = await policy.apply({ request: req("gzip, br"), response: htmlResponse(big) });
    expect(result.headers.get("Content-Encoding")).toBe("br");
    const buf = Buffer.from(await result.arrayBuffer());
    expect(brotliDecompressSync(buf).toString("utf8")).toBe(big);
  });

  test("skips compression below threshold", async () => {
    const { logger } = makeLogger();
    const policy = new DynamicResponsePolicy(makeConfig({ minify: false }), logger);
    const result = await policy.apply({ request: req("br"), response: htmlResponse("<p>tiny</p>") });
    expect(result.headers.has("Content-Encoding")).toBe(false);
  });

  test("skips when client advertises no supported encoding", async () => {
    const { logger } = makeLogger();
    const policy = new DynamicResponsePolicy(makeConfig({ minify: false }), logger);
    const result = await policy.apply({ request: req("identity"), response: htmlResponse(big) });
    expect(result.headers.has("Content-Encoding")).toBe(false);
  });

  test("does not double-encode an already-encoded response", async () => {
    const { logger } = makeLogger();
    const policy = new DynamicResponsePolicy(makeConfig(), logger);
    const res = new Response(big, {
      headers: { "Content-Type": "text/html", "Content-Encoding": "gzip" },
    });
    const result = await policy.apply({ request: req("br"), response: res });
    expect(result.headers.get("Content-Encoding")).toBe("gzip");
  });
});
