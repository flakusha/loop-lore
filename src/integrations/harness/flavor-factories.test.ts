// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Flavor dispatch tests: the `harness` flavor on a `harness.acp.profiles[]`
 * entry selects the shipped adapter factory. Constructors are lazy (no spawn
 * until the first adapter call), so no subprocess is needed — parallel-safe.
 */
import { describe, expect, it, } from "bun:test";
import { HARNESS_FLAVORS, } from "../../config/schema/harness";
import { HARNESS_QUOTA_SURFACES, type HarnessQuotaSurface, } from "./adapter-types";
import { AntigravityAcpAdapter, } from "./antigravity";
import { ClaudeCodeAcpAdapter, } from "./claude-code";
import { CodexAcpAdapter, } from "./codex";
import {
  DEFAULT_HARNESS_FLAVOR,
  FLAVOR_QUOTA_SURFACES,
  HARNESS_ADAPTER_FACTORIES,
  resolveAdapterFactory,
} from "./flavor-factories";
import { OmpAcpAdapter, } from "./omp";
import { OpenCodeAcpAdapter, } from "./opencode";

/** The argv every lazy factory accepts without spawning. */
const CMD = ["fake-acp",];

describe("harness adapter flavor dispatch", () => {
  it("maps every shipped flavor to its adapter class", () => {
    expect(Object.keys(HARNESS_ADAPTER_FACTORIES,).sort(),).toEqual([...HARNESS_FLAVORS,].sort(),);
    expect(HARNESS_ADAPTER_FACTORIES.omp("p", CMD,),).toBeInstanceOf(OmpAcpAdapter,);
    expect(HARNESS_ADAPTER_FACTORIES.opencode("p", CMD,),).toBeInstanceOf(OpenCodeAcpAdapter,);
    expect(HARNESS_ADAPTER_FACTORIES.codex("p", CMD,),).toBeInstanceOf(CodexAcpAdapter,);
    expect(HARNESS_ADAPTER_FACTORIES["claude-code"]("p", CMD,),).toBeInstanceOf(ClaudeCodeAcpAdapter,);
    expect(HARNESS_ADAPTER_FACTORIES.antigravity("p", CMD,),).toBeInstanceOf(AntigravityAcpAdapter,);
  });

  it("resolves each flavor via resolveAdapterFactory", () => {
    expect(resolveAdapterFactory("omp",)("p", CMD,),).toBeInstanceOf(OmpAcpAdapter,);
    expect(resolveAdapterFactory("opencode",)("p", CMD,),).toBeInstanceOf(OpenCodeAcpAdapter,);
    expect(resolveAdapterFactory("codex",)("p", CMD,),).toBeInstanceOf(CodexAcpAdapter,);
    expect(resolveAdapterFactory("claude-code",)("p", CMD,),).toBeInstanceOf(ClaudeCodeAcpAdapter,);
    expect(resolveAdapterFactory("antigravity",)("p", CMD,),).toBeInstanceOf(AntigravityAcpAdapter,);
  });

  it("defaults an omitted flavor to omp", () => {
    expect(DEFAULT_HARNESS_FLAVOR,).toBe("omp",);
    expect(resolveAdapterFactory(undefined,)("p", CMD,),).toBeInstanceOf(OmpAcpAdapter,);
  });

  it("rejects a flavor with no shipped adapter", () => {
    expect(() => resolveAdapterFactory("bedrock",)).toThrow(/no ACP adapter factory/,);
  });
});

describe("harness quota surfaces", () => {
  it("declares the closed wire-surface union", () => {
    expect([...HARNESS_QUOTA_SURFACES,],).toEqual(["omp-ext", "none",],);
  });

  it("keys FLAVOR_QUOTA_SURFACES for every shipped flavor", () => {
    expect(Object.keys(FLAVOR_QUOTA_SURFACES,).sort(),).toEqual([...HARNESS_FLAVORS,].sort(),);
  });

  it("maps omp to the omp-ext surface and every other flavor to none", () => {
    expect(FLAVOR_QUOTA_SURFACES.omp,).toBe("omp-ext",);
    for (const flavor of HARNESS_FLAVORS) {
      if (flavor === "omp") {
        continue;
      }

      expect(FLAVOR_QUOTA_SURFACES[flavor],).toBe("none",);
    }
  });

  it("only ever names a declared surface", () => {
    // Compile-time ratchet: a dropped union member fails to build.
    const declared: Record<HarnessQuotaSurface, true> = { "omp-ext": true, none: true, };
    for (const surface of Object.values(FLAVOR_QUOTA_SURFACES,)) {
      expect(surface in declared,).toBe(true,);
    }
  });
});
