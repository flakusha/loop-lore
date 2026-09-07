// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  applyDeprecationHeaders,
  deprecationAfterHandle,
  withDeprecationHeaders,
} from "./deprecation-headers";

const OPTIONS = {
  deprecatedVersion: "1",
  successorVersion: "2",
  sunset: "Sat, 01 Jan 2028 00:00:00 GMT",
};

const CONFIG = { enabled: true, ...OPTIONS, };

describe("withDeprecationHeaders", () => {
  test("sets Sunset, Deprecation, and Link headers", () => {
    const res = withDeprecationHeaders(new Response("ok",), OPTIONS,);
    expect(res.headers.get("Sunset",),).toBe(OPTIONS.sunset,);
    expect(res.headers.get("Deprecation",),).toBe("true",);
    expect(res.headers.get("Link",),).toBe('</api/v2>; rel="successor-version"',);
  });

  test("preserves status and body", async () => {
    const res = withDeprecationHeaders(new Response("ok", { status: 201, },), OPTIONS,);
    expect(res.status,).toBe(201,);
    expect(await res.text(),).toBe("ok",);
  });
});

describe("applyDeprecationHeaders", () => {
  test("wraps with deprecation headers when enabled", () => {
    const res = applyDeprecationHeaders(new Response("ok",), CONFIG,);
    expect(res.headers.get("Sunset",),).toBe(OPTIONS.sunset,);
    expect(res.headers.get("Deprecation",),).toBe("true",);
    expect(res.headers.get("X-API-Deprecated-Version",),).toBe("1",);
  });

  test("returns the original response unchanged when disabled", () => {
    const original = new Response("ok",);
    const res = applyDeprecationHeaders(original, { ...CONFIG, enabled: false, },);
    expect(res,).toBe(original,);
    expect(res.headers.get("Sunset",),).toBeNull();
  });
});

describe("deprecationAfterHandle", () => {
  test("does not annotate when disabled", () => {
    const hook = deprecationAfterHandle({ ...CONFIG, enabled: false, },);
    const set: { headers: Record<string, string> } = { headers: {}, };
    hook({ set, } as any,);
    expect(set.headers,).toEqual({},);
  });

  test("annotates ctx.set.headers when enabled", () => {
    const hook = deprecationAfterHandle(CONFIG,);
    const set: { headers: Record<string, string> } = { headers: {}, };
    hook({ set, } as any,);
    expect(set.headers["Sunset"],).toBe(OPTIONS.sunset,);
    expect(set.headers["Deprecation"],).toBe("true",);
    expect(set.headers["Link"],).toBe('</api/v2>; rel="successor-version"',);
    expect(set.headers["X-API-Deprecated-Version"],).toBe("1",);
  });

  test("preserves existing headers set by earlier middleware", () => {
    const hook = deprecationAfterHandle(CONFIG,);
    const set: { headers: Record<string, string> } = {
      headers: { "x-custom": "keep", },
    };
    hook({ set, } as any,);
    expect(set.headers["x-custom"],).toBe("keep",);
    expect(set.headers["Sunset"],).toBe(OPTIONS.sunset,);
  });
});
