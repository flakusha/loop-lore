// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the response-header policy engine.
 * Pure logic — constructs Responses and asserts header sets per route kind.
 */

import { describe, expect, test } from "bun:test";
import type { HeadersConfig } from "../config/schema";
import { ResponseHeaderPolicy } from "./response-headers";

function makeConfig(overrides: Partial<HeadersConfig> = {}): HeadersConfig {
  const base: HeadersConfig = {
    enabled: true,
    referrerPolicy: "strict-origin-when-cross-origin",
    xContentTypeOptions: true,
    xFrameOptions: "DENY",
    permissionsPolicy: "geolocation=()",
    csp: {
      enabled: true,
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", "wss:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: true,
      reportOnly: false,
    },
    crossOriginOpenerPolicy: null,
    crossOriginEmbedderPolicy: null,
    crossOriginResourcePolicy: "cross-origin",
    timingAllowOrigin: "",
    immutableHashedAssets: true,
    linkPreload: ["/app.js"],
    acceptClientHints: [],
    saveData: false,
    earlyHints: { enabled: false },
    reportingEndpoints: {},
    nel: null,
  };
  return { ...base, ...overrides };
}

function req(method: string, url: string): Request {
  return new Request(url, { method });
}

function res(status: number, headers: Record<string, string>, body = ""): Response {
  return new Response(body, { status, headers });
}

describe("ResponseHeaderPolicy.apply — disabled", () => {
  test("returns response unchanged when enabled=false", async () => {
    const policy = new ResponseHeaderPolicy(makeConfig({ enabled: false }));
    const response = res(200, { "content-type": "text/html" }, "hi");
    const out = policy.apply({ request: req("GET", "https://x/"), response });
    expect(out.headers.get("Content-Security-Policy")).toBeNull();
    expect(out.headers.get("X-Content-Type-Options")).toBeNull();
  });
});

describe("ResponseHeaderPolicy.apply — classification", () => {
  const policy = new ResponseHeaderPolicy(makeConfig());

  test("html route emits CSP + Link + CORP same-origin", async () => {
    const response = res(200, { "content-type": "text/html; charset=utf-8" }, "<html></html>");
    const out = policy.apply({ request: req("GET", "https://x/chat"), response });
    expect(out.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(out.headers.get("Link")).toContain("rel=preload; as=script");
    expect(out.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(out.headers.get("X-Frame-Options")).toBe("DENY");
    expect(out.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  test("csp.reportOnly emits Report-Only header instead of enforcing", async () => {
    const base = makeConfig();
    const policy = new ResponseHeaderPolicy(makeConfig({ csp: { ...base.csp, reportOnly: true } }));
    const response = res(200, { "content-type": "text/html" }, "<html></html>");
    const out = policy.apply({ request: req("GET", "https://x/"), response });
    expect(out.headers.get("Content-Security-Policy")).toBeNull();
    expect(out.headers.get("Content-Security-Policy-Report-Only")).toContain("default-src 'self'");
  });

  test("default CSP drops 'unsafe-hashes' (inline handlers migrated to Alpine x-on)", async () => {
    const policy = new ResponseHeaderPolicy(makeConfig());
    const response = res(200, { "content-type": "text/html" }, "<html></html>");
    const out = policy.apply({ request: req("GET", "https://x/"), response });
    expect(out.headers.get("Content-Security-Policy")).not.toContain("'unsafe-hashes'");
  });

  test("api route gets security headers but no CSP", async () => {
    const response = res(200, { "content-type": "application/json" }, "{}");
    const out = policy.apply({ request: req("GET", "https://x/api/chats"), response });
    expect(out.headers.get("Content-Security-Policy")).toBeNull();
    expect(out.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(out.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(out.headers.get("Permissions-Policy")).toBe("geolocation=()");
  });

  test("static route gets CORP cross-origin, no CSP", async () => {
    const response = res(200, { "content-type": "application/javascript" }, "/* */");
    const out = policy.apply({ request: req("GET", "https://x/app.js"), response });
    expect(out.headers.get("Content-Security-Policy")).toBeNull();
    expect(out.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
  });
});

describe("ResponseHeaderPolicy.apply — precedence", () => {
  test("route-set headers are not clobbered", async () => {
    const policy = new ResponseHeaderPolicy(makeConfig());
    const response = res(200, {
      "content-type": "text/html; charset=utf-8",
      "x-frame-options": "SAMEORIGIN",
      "cache-control": "public, max-age=60",
    });
    const out = policy.apply({ request: req("GET", "https://x/"), response });
    expect(out.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(out.headers.get("x-frame-options")).toBe("SAMEORIGIN"); // route wins
    expect(out.headers.get("cache-control")).toBe("public, max-age=60");
  });
});

describe("ResponseHeaderPolicy.apply — immutable augmentation", () => {
  test("hashed static asset gains immutable", async () => {
    const policy = new ResponseHeaderPolicy(makeConfig());
    const response = res(200, {
      "content-type": "application/javascript",
      "cache-control": "public, max-age=31536000",
    });
    const out = policy.apply({ request: req("GET", "https://x/alpine-tx4kdwfm.js"), response });
    expect(out.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  test("non-hashed static asset left untouched", async () => {
    const policy = new ResponseHeaderPolicy(makeConfig());
    const response = res(200, {
      "content-type": "application/javascript",
      "cache-control": "public, max-age=60",
    });
    const out = policy.apply({ request: req("GET", "https://x/app.js"), response });
    expect(out.headers.get("cache-control")).toBe("public, max-age=60");
  });
});

describe("ResponseHeaderPolicy.apply — isolation toggles", () => {
  test("COOP/COEP emitted on html when enabled", async () => {
    const policy = new ResponseHeaderPolicy(
      makeConfig({
        crossOriginOpenerPolicy: "same-origin",
        crossOriginEmbedderPolicy: "require-corp",
      }),
    );
    const response = res(200, { "content-type": "text/html" }, "<html></html>");
    const out = policy.apply({ request: req("GET", "https://x/"), response });
    expect(out.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(out.headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
  });

  test("COOP/COEP omitted by default", async () => {
    const policy = new ResponseHeaderPolicy(makeConfig());
    const response = res(200, { "content-type": "text/html" }, "<html></html>");
    const out = policy.apply({ request: req("GET", "https://x/"), response });
    expect(out.headers.get("Cross-Origin-Opener-Policy")).toBeNull();
    expect(out.headers.get("Cross-Origin-Embedder-Policy")).toBeNull();
  });
});

describe("ResponseHeaderPolicy.apply — observability + client hints", () => {
  test("reporting endpoints, NEL, and client hints on html", async () => {
    const policy = new ResponseHeaderPolicy(
      makeConfig({
        reportingEndpoints: { default: "https://x/report" },
        nel: "{ \"report_to\": \"default\", \"max_age\": 31536000 }",
        acceptClientHints: ["Device-Memory", "RTT"],
        saveData: true,
      }),
    );
    const response = res(200, { "content-type": "text/html" }, "<html></html>");
    const out = policy.apply({ request: req("GET", "https://x/"), response });
    expect(out.headers.get("Reporting-Endpoints")).toBe("default=\"https://x/report\"");
    expect(out.headers.get("NEL")).toContain("report_to");
    expect(out.headers.get("Accept-CH")).toBe("Device-Memory, RTT");
    expect(out.headers.get("Critical-CH")).toBe("Device-Memory, RTT");
    expect(out.headers.get("Save-Data")).toBe("on");
  });
});

describe("ResponseHeaderPolicy.apply — streaming safe", () => {
  test("re-wraps a streaming body without buffering", async () => {
    const policy = new ResponseHeaderPolicy(makeConfig());
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("streamed"));
        controller.close();
      },
    });
    const response = new Response(stream, { status: 200, headers: { "content-type": "text/html" } });
    const out = policy.apply({ request: req("GET", "https://x/"), response });
    expect(out.headers.get("Content-Security-Policy")).not.toBeNull();
    expect(await out.text()).toBe("streamed");
  });

  test("304 responses keep null body", async () => {
    const policy = new ResponseHeaderPolicy(makeConfig());
    const response = new Response(null, { status: 304, headers: { "content-type": "text/html" } });
    const out = policy.apply({ request: req("GET", "https://x/"), response });
    expect(out.status).toBe(304);
    expect(await out.text()).toBe("");
  });
});
