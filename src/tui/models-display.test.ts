// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure display-formatter tests for the models overlay and the status-bar
 * health segment. Everything here is string work — no terminal needed.
 */
import { describe, expect, it, } from "bun:test";
import type { PublicProvider, } from "./models-api";
import {
  formatConnectionTest,
  formatProviderHealth,
  HEALTH_UNAVAILABLE,
} from "./models-display";

describe("formatProviderHealth", () => {
  it("shows the unavailable marker when the list is empty", () => {
    expect(formatProviderHealth([],),).toBe(HEALTH_UNAVAILABLE,);
    expect(HEALTH_UNAVAILABLE,).toBe("Providers: ?",);
  });

  it("counts healthy providers and omits names when all are healthy", () => {
    const providers: PublicProvider[] = [
      { name: "openai", label: "OpenAI", status: "healthy", },
      { name: "ollama", label: "Ollama", status: "healthy", },
    ];

    expect(formatProviderHealth(providers,),).toBe("Providers: {green-fg}2{/green-fg}/2 ok",);
  });

  it("names the unhealthy providers, capped and with a remainder count", () => {
    const providers: PublicProvider[] = [
      { name: "a", label: "A", status: "down", },
      { name: "b", label: "B", status: "down", },
      { name: "c", label: "C", status: "down", },
      { name: "ok-one", label: "OK", status: "healthy", },
    ];

    const segment = formatProviderHealth(providers,);
    expect(segment,).toContain("{green-fg}1{/green-fg}/4",);
    expect(segment,).toContain("(a, b",);
    expect(segment,).toContain("{yellow-fg}",);
  });
});

describe("formatConnectionTest", () => {
  it("colors a passing verdict green with its latency", () => {
    expect(formatConnectionTest({ ok: true, status: "reachable", latencyMs: 12, },),)
      .toBe("{green-fg}reachable{/green-fg} 12ms",);
  });

  it("prefers the provider's own error text on a failed check", () => {
    expect(formatConnectionTest({ ok: false, status: "down", error: "conn refused", latencyMs: 3, },),)
      .toBe("{red-fg}conn refused{/red-fg} 3ms",);
  });

  it("falls back to the status word when no error text exists", () => {
    expect(formatConnectionTest({ ok: false, status: "timeout", },),).toBe("{red-fg}timeout{/red-fg}",);
  });
});
