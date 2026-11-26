// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for proxyForUrl — loopback hosts bypass the proxy, everything else
 * (including unparseable input) keeps the default.
 */
import { describe, expect, test, } from "bun:test";
import { proxyForUrl, } from "./fetch";

describe("proxyForUrl", () => {
  test("loopback hosts bypass the proxy", () => {
    expect(proxyForUrl("http://localhost:8188/prompt",),).toBe(false,);
    expect(proxyForUrl("http://127.0.0.1:8188/prompt",),).toBe(false,);
    expect(proxyForUrl("http://[::1]:8188/prompt",),).toBe(false,);
  });

  test("remote URLs keep the default", () => {
    expect(proxyForUrl("https://api.anthropic.com/v1/messages",),).toBeUndefined();
    expect(proxyForUrl("http://192.168.1.10:8188/prompt",),).toBeUndefined();
  });

  test("unparseable URLs keep the default", () => {
    expect(proxyForUrl("not a url",),).toBeUndefined();
    expect(proxyForUrl("",),).toBeUndefined();
  });
});
