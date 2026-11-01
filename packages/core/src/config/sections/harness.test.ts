// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * harness.acp config section tests: defaults, semantic validation, and the
 * JSON-schema gate. Pure — no subprocess, no shared state (parallel-safe).
 */
import { describe, expect, it, } from "bun:test";
import { jsonSchema, } from "../schema-class/json-schema";
import type { HarnessAcpConfig, } from "../schema/harness";
import { HARNESS_FLAVORS, } from "../schema/harness";
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

  it("rejects an unknown harness flavor", () => {
    expect(() => validateAcpProfiles(acp([profile({ harness: "bedrock", },),],),)).toThrow(
      /unknown harness flavor/,
    );
  });

  it("accepts a known harness flavor and omits-defaults to omp", () => {
    expect(() => validateAcpProfiles(acp([profile({ harness: "opencode", },), profile({ name: "p2", },),],),)).not
      .toThrow();
  });

  it("json-schema meta exposes the harness flavor enum", () => {
    const section = harnessMeta.properties.acp as { properties?: Record<string, unknown> };
    const profiles = section.properties?.profiles as
      | { items?: { properties?: Record<string, { enum?: string[]; default?: string }> } }
      | undefined;

    const flavor = profiles?.items?.properties?.harness;
    expect(flavor?.enum,).toEqual([...HARNESS_FLAVORS,],);
    expect(flavor?.default,).toBe("omp",);
  });

  it("rejects non-positive limits", () => {
    expect(() => validateAcpProfiles(acp([profile({ limits: { rpm: 0, }, },),],),)).toThrow(/limits\.rpm/,);
  });

  it("tosGrayzoneAcknowledged is absent by default (defaults unchanged)", () => {
    expect(HARNESS_DEFAULTS.acp.profiles,).toEqual([],);
    const p = profile() as { tosGrayzoneAcknowledged?: unknown };
    expect("tosGrayzoneAcknowledged" in p ? p.tosGrayzoneAcknowledged : undefined,).toBeUndefined();
    expect(() => validateAcpProfiles(acp([profile(),],),)).not.toThrow();
  });

  it("accepts tosGrayzoneAcknowledged true", () => {
    expect(() => validateAcpProfiles(acp([profile({ tosGrayzoneAcknowledged: true, },),],),)).not.toThrow();
  });

  it("accepts tosGrayzoneAcknowledged false", () => {
    expect(() => validateAcpProfiles(acp([profile({ tosGrayzoneAcknowledged: false, },),],),)).not.toThrow();
  });

  it("rejects a non-boolean tosGrayzoneAcknowledged", () => {
    expect(() => validateAcpProfiles(acp([profile({ tosGrayzoneAcknowledged: "yes", },),],),)).toThrow(
      /tosGrayzoneAcknowledged must be a boolean/,
    );
    expect(() => validateAcpProfiles(acp([profile({ tosGrayzoneAcknowledged: 1, },),],),)).toThrow(
      /tosGrayzoneAcknowledged must be a boolean/,
    );
    expect(() => validateAcpProfiles(acp([profile({ tosGrayzoneAcknowledged: null, },),],),)).toThrow(
      /tosGrayzoneAcknowledged must be a boolean/,
    );
  });

  it("tosGrayzoneAcknowledged is scoped per profile", () => {
    const flagged = profile({ name: "flagged", tosGrayzoneAcknowledged: true, },);
    const plain = profile({ name: "plain", },);
    expect(() => validateAcpProfiles(acp([flagged, plain,],),)).not.toThrow();
    expect((flagged as { tosGrayzoneAcknowledged?: boolean }).tosGrayzoneAcknowledged,).toBe(true,);
    expect((plain as { tosGrayzoneAcknowledged?: boolean }).tosGrayzoneAcknowledged,).toBeUndefined();
  });

  it("json-schema meta documents tosGrayzoneAcknowledged with the ToS warning", () => {
    const prop = harnessMeta.properties.acp.properties.profiles.items.properties.tosGrayzoneAcknowledged;
    expect(prop.type,).toBe("boolean",);
    expect(prop.default,).toBe(false,);
    expect(prop.description,).toMatch(/may conflict with the provider's ToS/,);
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
