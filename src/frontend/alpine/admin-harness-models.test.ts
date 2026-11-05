// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin harness model-discovery schema contracts: capabilities, one
 * discovered model, and the models response body must accept exactly what
 * the models route emits and reject obvious shape violations.
 *
 * Resource contract (parallel-safe): pure in-memory TypeBox validation —
 * no DOM, no DB, no ports, no shared globals, order-independent.
 */
import { Value, } from "@sinclair/typebox/value";
import { describe, expect, it, } from "bun:test";
import {
  HarnessDiscoveredModelSchema,
  HarnessModelCapabilitiesSchema,
  HarnessModelsResponse,
} from "./admin-harness-schema";

/** Capabilities as a provider table would report them. */
const capabilities = {
  contextWindow: 128000,
  maxOutput: 8192,
  supportsTools: true,
  supportsVision: false,
  supportsThinking: true,
  modalities: ["text",],
};

/** A harness-discovered model row. */
const discovered = {
  profile: "p",
  harness: "codex",
  model: "gpt-x",
  source: "harness",
  capabilities,
};

describe("admin harness model-discovery schemas", () => {
  it("HarnessModelCapabilitiesSchema allows null context/max and rejects bad flags", () => {
    expect(Value.Check(HarnessModelCapabilitiesSchema, capabilities,),).toBe(true,);
    expect(Value.Check(HarnessModelCapabilitiesSchema, { ...capabilities, contextWindow: null, maxOutput: null, },),)
      .toBe(true,);

    expect(Value.Check(HarnessModelCapabilitiesSchema, { ...capabilities, supportsTools: "yes", },),).toBe(false,);
    expect(Value.Check(HarnessModelCapabilitiesSchema, { ...capabilities, modalities: "text", },),).toBe(false,);
  });

  it("HarnessDiscoveredModelSchema accepts harness and static sources", () => {
    expect(Value.Check(HarnessDiscoveredModelSchema, discovered,),).toBe(true,);
    expect(Value.Check(HarnessDiscoveredModelSchema, { ...discovered, source: "static", capabilities: null, },),).toBe(
      true,
    );

    expect(Value.Check(HarnessDiscoveredModelSchema, { ...discovered, source: "guessed", },),).toBe(false,);

    const { capabilities: _dropped, ...withoutCapabilities } = discovered;

    expect(Value.Check(HarnessDiscoveredModelSchema, withoutCapabilities,),).toBe(false,);
  });

  it("HarnessDiscoveredModelSchema accepts the optional reason and rejects unknown fields", () => {
    expect(Value.Check(HarnessDiscoveredModelSchema, { ...discovered, reason: "live probe", },),).toBe(true,);
  });

  it("HarnessModelsResponse wraps the discovered-model array", () => {
    expect(Value.Check(HarnessModelsResponse, { items: [discovered,], },),).toBe(true,);
    expect(Value.Check(HarnessModelsResponse, { items: [], },),).toBe(true,);
    expect(Value.Check(HarnessModelsResponse, { items: [null,], },),).toBe(false,);
    expect(Value.Check(HarnessModelsResponse, {},),).toBe(false,);
  });
});
