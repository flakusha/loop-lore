// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness tab settings slice: load, row shaping, 403 and shape failures.
 * Same fetch seam as admin-harness.test.ts (globalThis.apiFetch + seeded
 * locale catalog), so a 403 renders the translated message.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import type { ApiFetchMock, } from "../tests/test-types";
import {
  buildProfileRows,
  emptyHarnessSettingsState,
  loadHarnessSettings,
} from "./admin-harness-settings";

const globalState = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  showToast?: (type: string, message: string,) => void;
};

const originalFetch = globalState.apiFetch;
const originalToast = globalState.showToast;
const localeHost = globalThis as unknown as { __localeStrings?: unknown };
const originalLocale = localeHost.__localeStrings;
let calls: string[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

// `t()` resolves against the server-injected catalog; seed it from the real
// en.json so the usage badges render translated labels.
const EN = JSON.parse(
  readFileSync(join(import.meta.dir, "../../public/locales/en.json",), "utf8",),
) as Record<string, unknown>;

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  globalState.apiFetch = (url,) => {
    calls.push(url,);
    return handler(url,);
  };

  globalState.showToast = () => {};
  localeHost.__localeStrings = EN;
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
  localeHost.__localeStrings = originalLocale;
},);

/** Wire payload the endpoint returns for two configured profiles. */
const SETTINGS = {
  enabled: false,
  profiles: [
    {
      name: "omp-main",
      flavor: "omp",
      usageClasses: ["api", "local",],
      subscriptionBacked: false,
      noteKey: "harness.tos.note.omp",
      tosGrayzoneAcknowledged: false,
    },
    {
      name: "cc-sub",
      flavor: "claude-code",
      usageClasses: ["subscription-backed", "api",],
      subscriptionBacked: true,
      noteKey: "harness.tos.note.claude-code",
      tosGrayzoneAcknowledged: true,
    },
  ],
};

describe("loadHarnessSettings", () => {
  test("fills enabled state and profile rows from the settings endpoint", async () => {
    handler = async (url,) => {
      if (url === "/api/v1/harness/settings") { return Response.json(SETTINGS,); }
      return new Response("", { status: 404, },);
    };

    const state = emptyHarnessSettingsState();
    await loadHarnessSettings(state,);

    expect(state.loadingHarnessSettings,).toBe(false,);
    expect(state.harnessSettingsError,).toBe("",);
    expect(state.harnessSettingsEnabled,).toBe(false,);
    expect(state.harnessProfileRows,).toHaveLength(2,);

    const omp = state.harnessProfileRows[0];
    expect(omp?.name,).toBe("omp-main",);
    expect(omp?.usageBadges,).toEqual([
      { value: "api", label: "API", ungated: true, },
      { value: "local", label: "Local", ungated: true, },
    ],);

    expect(omp?.subscriptionBacked,).toBe(false,);
    expect(omp?.acknowledged,).toBe(false,);

    const cc = state.harnessProfileRows[1];
    expect(cc?.usageBadges,).toEqual([
      { value: "subscription-backed", label: "Subscription-backed", ungated: false, },
      { value: "api", label: "API", ungated: true, },
    ],);

    expect(cc?.acknowledged,).toBe(true,);
    expect(calls,).toEqual(["/api/v1/harness/settings",],);
  });

  test("a 403 is a rendered state, not a blank panel", async () => {
    handler = async () => new Response("", { status: 403, },);
    const state = emptyHarnessSettingsState();
    await loadHarnessSettings(state,);

    expect(state.harnessSettingsError,).not.toBe("",);
    expect(state.harnessSettingsError,).not.toContain("harness.errorForbidden",);
    expect(state.harnessSettingsError.toLowerCase(),).toContain("permission",);
    expect(state.harnessProfileRows,).toEqual([],);
    expect(state.harnessSettingsEnabled,).toBe(false,);
  });

  test("a bad payload degrades to the settings error without throwing", async () => {
    handler = async () => Response.json({ enabled: "yes", profiles: "all", },);
    const state = emptyHarnessSettingsState();
    await loadHarnessSettings(state,);

    expect(state.harnessSettingsError,).not.toBe("",);
    expect(state.harnessProfileRows,).toEqual([],);
    expect(state.loadingHarnessSettings,).toBe(false,);
  });
});

describe("buildProfileRows", () => {
  test("marks local and api badges ungated, subscription-backed not", () => {
    const rows = buildProfileRows(SETTINGS.profiles,);
    expect(rows[0]?.usageBadges.every((b,) => b.ungated),).toBe(true,);
    expect(rows[1]?.usageBadges.filter((b,) => b.value === "subscription-backed")[0]?.ungated,)
      .toBe(false,);
  });
});
