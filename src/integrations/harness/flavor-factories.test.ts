// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Flavor dispatch tests: the `harness` flavor on a `harness.acp.profiles[]`
 * entry selects the shipped adapter factory. Constructors are lazy (no spawn
 * until the first adapter call), so no subprocess is needed — parallel-safe.
 */
import { describe, expect, it, } from "bun:test";
import { HARNESS_FLAVORS, } from "../../config/schema/harness";
import { CodexAcpAdapter, } from "./codex";
import {
  DEFAULT_HARNESS_FLAVOR,
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
  });

  it("resolves each flavor via resolveAdapterFactory", () => {
    expect(resolveAdapterFactory("omp",)("p", CMD,),).toBeInstanceOf(OmpAcpAdapter,);
    expect(resolveAdapterFactory("opencode",)("p", CMD,),).toBeInstanceOf(OpenCodeAcpAdapter,);
    expect(resolveAdapterFactory("codex",)("p", CMD,),).toBeInstanceOf(CodexAcpAdapter,);
  });

  it("defaults an omitted flavor to omp", () => {
    expect(DEFAULT_HARNESS_FLAVOR,).toBe("omp",);
    expect(resolveAdapterFactory(undefined,)("p", CMD,),).toBeInstanceOf(OmpAcpAdapter,);
  });

  it("rejects a flavor with no shipped adapter", () => {
    expect(() => resolveAdapterFactory("claude-code",)).toThrow(/no ACP adapter factory/,);
  });
});
