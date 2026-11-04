// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * isolation-gate tests. Pure verdict tests — no DB, no subprocesses, no
 * shared state; each case builds its own config literal.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { type HarnessConfig, } from "../../config/schema/harness";
import {
  harnessAdminSettings,
  initHarnessAdminSettings,
  resetHarnessAdminSettings,
} from "./admin-settings";
import { assertHarnessExecution, type HarnessIsolationVerdict, } from "./isolation-gate";

// Parallel-safety: the admin-settings singleton is process-shared and other
// files seed it; every case in THIS file runs against an UNSEEDED store so
// the file-config fallback governs, regardless of cross-file order.
beforeEach(() => {
  resetHarnessAdminSettings();
},);

afterEach(() => {
  resetHarnessAdminSettings();
},);

const PROFILE = {
  name: "omp-main",
  command: ["omp", "--profile", "main", "acp",],
  tiers: { fast: { model: "zai/glm", capabilities: [], }, },
};

/** An enabled config with the one profile above. */
function configWith(overrides?: Partial<HarnessConfig["acp"]>,): HarnessConfig {
  return { acp: { enabled: true, profiles: [PROFILE,], ...overrides, }, };
}

/** Assert an allowed verdict and return it narrowed. */
function expectAllowed(verdict: HarnessIsolationVerdict,): HarnessIsolationVerdict & { allowed: true } {
  if (!verdict.allowed) { throw new Error(`expected an allowed verdict, got ${verdict.code}`,); }
  return verdict;
}

describe("assertHarnessExecution", () => {
  it("allows a solo principal onto a configured profile", () => {
    const verdict = expectAllowed(assertHarnessExecution({
      config: configWith(),
      role: "solo",
      userId: "user-1",
      profileName: "omp-main",
    },),);

    expect(verdict.profile,).toBe(PROFILE,);
    expect(verdict.userId,).toBe("user-1",);
    expect(verdict.profile.command,).toEqual(["omp", "--profile", "main", "acp",],);
  });

  it("allows the admin role", () => {
    const verdict = assertHarnessExecution({
      config: configWith(),
      role: "admin",
      userId: "root",
      profileName: "omp-main",
    },);

    expectAllowed(verdict,);
  });

  it("denies when the master switch is off, even for an admin", () => {
    const verdict = assertHarnessExecution({
      config: configWith({ enabled: false, },),
      role: "admin",
      userId: "root",
      profileName: "omp-main",
    },);

    expect(verdict,).toMatchObject({ allowed: false, code: "harness_disabled", },);
  });

  it("denies the moderator role", () => {
    const verdict = assertHarnessExecution({
      config: configWith(),
      role: "moderator",
      userId: "mod-1",
      profileName: "omp-main",
    },);

    expect(verdict,).toMatchObject({ allowed: false, code: "role_denied", },);
  });

  it("denies the plain user role", () => {
    const verdict = assertHarnessExecution({
      config: configWith(),
      role: "user",
      userId: "user-2",
      profileName: "omp-main",
    },);

    expect(verdict,).toMatchObject({ allowed: false, code: "role_denied", },);
  });

  it("denies anonymous callers", () => {
    const verdict = assertHarnessExecution({
      config: configWith(),
      role: null,
      userId: null,
      profileName: "omp-main",
    },);

    expect(verdict,).toMatchObject({ allowed: false, code: "role_denied", },);
    if (verdict.allowed) { return; }
    expect(verdict.message,).toContain("anonymous",);
  });

  it("denies profile names outside the admin allowlist", () => {
    const verdict = assertHarnessExecution({
      config: configWith(),
      role: "admin",
      userId: "root",
      profileName: "evil-profile",
    },);

    expect(verdict,).toMatchObject({ allowed: false, code: "profile_unknown", },);
  });

  it("denies when no profiles are configured at all", () => {
    const verdict = assertHarnessExecution({
      config: configWith({ profiles: [], },),
      role: "admin",
      userId: "root",
      profileName: "omp-main",
    },);

    expect(verdict,).toMatchObject({ allowed: false, code: "profile_unknown", },);
  });

  it("checks the master switch before the role gate", () => {
    const verdict = assertHarnessExecution({
      config: configWith({ enabled: false, },),
      role: "user",
      userId: "user-3",
      profileName: "omp-main",
    },);

    expect(verdict,).toMatchObject({ allowed: false, code: "harness_disabled", },);
  });
});

// Resource contract: in-memory admin-settings store only — seeded in the
// case, reset in beforeEach AND afterEach so a failed case cannot leak
// store state into siblings; no DB, no subprocesses, no ports.
describe("assertHarnessExecution effective admin settings (BUG 369e695)", () => {
  beforeEach(() => {
    resetHarnessAdminSettings();
  },);

  afterEach(() => {
    resetHarnessAdminSettings();
  },);

  it("a disabled override suppresses spawn even with file enabled: true", () => {
    initHarnessAdminSettings({ enabled: true, profiles: [PROFILE,], },);
    harnessAdminSettings.update({ enabled: false, },);

    const verdict = assertHarnessExecution({
      config: configWith(),
      role: "admin",
      userId: "u1",
      profileName: "omp-main",
    },);

    expect(verdict,).toEqual({
      allowed: false,
      code: "harness_disabled",
      message: "harness.acp.enabled is false — external harness execution is off",
    },);
  });

  it("an enabled override over a file-disabled config allows spawn", () => {
    initHarnessAdminSettings({ enabled: false, profiles: [PROFILE,], },);
    harnessAdminSettings.update({ enabled: true, },);

    const verdict = assertHarnessExecution({
      config: configWith({ enabled: false, },),
      role: "admin",
      userId: "u1",
      profileName: "omp-main",
    },);

    expectAllowed(verdict,);
  });

  it("no-downgrade: an unseeded store falls back to the file layer", () => {
    // Store deliberately unseeded (reset in beforeEach): the file config
    // governs, exactly as before the effective view existed — an unavailable
    // store never widens access.
    const verdict = assertHarnessExecution({
      config: configWith(),
      role: "admin",
      userId: "u1",
      profileName: "omp-main",
    },);

    expectAllowed(verdict,);
  });
});
