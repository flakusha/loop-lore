// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * harness.acp config section tests: defaults, semantic validation, and the
 * JSON-schema gate. Pure — no subprocess, no shared state (parallel-safe).
 */
import { describe, expect, it, } from "bun:test";
import { jsonSchema, } from "../schema-class/json-schema";
import type { HarnessAcpConfig, } from "../schema/harness";
import {
  HARNESS_DEFAULT_COOLDOWN_MS,
  HARNESS_DEFAULT_MAX_CONSECUTIVE_FAILURES,
  HARNESS_DEFAULTS,
  harnessMeta,
  HarnessSection,
  isConcreteModelId,
  validateAcpProfiles,
} from "./harness";

/** A minimal valid profile for mutation in tests. */
function profile(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    name: "p1",
    command: ["omp", "acp",],
    tiers: { good: { model: "zai/glm-5.3", capabilities: ["tools",], }, },
    ...overrides,
  };
}

/** Build an acp block. */
function acp(profiles: unknown[], enabled = true,): HarnessAcpConfig {
  return { enabled, profiles: profiles as HarnessAcpConfig["profiles"], };
}

describe("harness.acp config section", () => {
  it("defaults to disabled with no profiles", () => {
    expect(HARNESS_DEFAULTS,).toEqual({ acp: { enabled: false, profiles: [], }, },);
  });

  it("section class applies overrides", () => {
    const section = new HarnessSection({ acp: { enabled: true, profiles: [], }, },);
    expect(section.acp.enabled,).toBe(true,);
  });

  it("isConcreteModelId accepts provider/id and rejects aliases", () => {
    expect(isConcreteModelId("zai/glm-5.3",),).toBe(true,);
    expect(isConcreteModelId("@smol",),).toBe(false,);
    expect(isConcreteModelId("plain",),).toBe(false,);
    expect(isConcreteModelId("a/b/c",),).toBe(false,);
    expect(isConcreteModelId("",),).toBe(false,);
  });

  it("validation is skipped while disabled", () => {
    expect(() => validateAcpProfiles(acp([], false,),)).not.toThrow();
  });

  it("accepts a valid profile list", () => {
    expect(() => validateAcpProfiles(acp([profile(),],),)).not.toThrow();
  });

  it("rejects duplicate profile names", () => {
    expect(() => validateAcpProfiles(acp([profile(), profile({ name: "p1", },),],),)).toThrow(
      /duplicate profile name/,
    );
  });

  it("rejects unknown tier keys", () => {
    const p = profile();
    (p.tiers as Record<string, unknown>).weird = { model: "a/b", capabilities: [], };
    expect(() => validateAcpProfiles(acp([p,],),)).toThrow(/unknown tier key "weird"/,);
  });

  it("rejects non-provider/id models", () => {
    const p = profile();
    (p.tiers as Record<string, unknown>).good = { model: "@smol", capabilities: [], };
    expect(() => validateAcpProfiles(acp([p,],),)).toThrow(/provider\/id/,);
  });

  it("rejects unknown capability flags", () => {
    const p = profile();
    (p.tiers as Record<string, unknown>).good = { model: "a/b", capabilities: ["bogus",], };
    expect(() => validateAcpProfiles(acp([p,],),)).toThrow(/capabilities/,);
  });

  it("rejects an empty command argv", () => {
    expect(() => validateAcpProfiles(acp([profile({ command: [], },),],),)).toThrow(/command/,);
  });

  it("rejects non-positive limits", () => {
    expect(() => validateAcpProfiles(acp([profile({ limits: { rpm: 0, }, },),],),)).toThrow(/limits\.rpm/,);
  });

  it("jsonSchema includes the harness section", () => {
    const schema = jsonSchema();
    const props = schema.properties as Record<string, { properties?: Record<string, unknown> }>;
    expect(props.harness?.properties?.acp,).toBeDefined();
  });

  it("exports match the runtime tier/capability lists", () => {
    expect(harnessMeta.properties.acp,).toBeDefined();
    expect(HARNESS_DEFAULT_COOLDOWN_MS,).toBeGreaterThan(0,);
    expect(HARNESS_DEFAULT_MAX_CONSECUTIVE_FAILURES,).toBeGreaterThan(0,);
    // Validation error text is derived from these lists — keep them in sync.
    expect(() => validateAcpProfiles(acp([profile({ tiers: { bogus: { model: "a/b", capabilities: [], }, }, },),],),))
      .toThrow(/allowed: good, fast/,);
  });
});
