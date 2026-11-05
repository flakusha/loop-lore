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
import { SETTINGS_URL, } from "./admin-harness-detail";
import {
  HarnessProfileSettingsSchema,
  HarnessSettingsNullable,
  HarnessSettingsResponse,
} from "./admin-harness-schema";
import {
  applyHarnessSettings,
  applySettings,
  buildProfileRows,
  confirmHarnessAck,
  declineHarnessAck,
  emptyHarnessSettingsState,
  type HarnessSettingsState as SettingsState,
  hasSubscriptionBacked,
  loadHarnessSettings,
  onHarnessToggle,
} from "./admin-harness-settings";
import { parseOr, } from "./validation";

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
  globalState.apiFetch = (url, opts,) => {
    calls.push(url,);
    return handler(url, opts,);
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
      availability: { available: false, reason: "loop-lore-no-such-binary not found on PATH", },
    },
    {
      name: "cc-sub",
      flavor: "claude-code",
      usageClasses: ["subscription-backed", "api",],
      subscriptionBacked: true,
      noteKey: "harness.tos.note.claude-code",
      tosGrayzoneAcknowledged: true,
      availability: { available: false, reason: "loop-lore-no-such-binary not found on PATH", },
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
    const rows = buildProfileRows(SETTINGS.profiles as never,);
    expect(rows[0]?.usageBadges.every((b,) => b.ungated),).toBe(true,);
    expect(rows[1]?.usageBadges.filter((b,) => b.value === "subscription-backed")[0]?.ungated,)
      .toBe(false,);
  });

  test("settings contract: schema constants and the settings URL stay aligned", () => {
    expect(SETTINGS_URL,).toBe("/api/v1/harness/settings",);
    expect(HarnessProfileSettingsSchema.properties.name.type,).toBe("string",);
    expect(HarnessSettingsResponse.properties.enabled.type,).toBe("boolean",);
    // Nullable schema accepts the plain payload and null.
    expect(parseOr(HarnessSettingsNullable, SETTINGS, null, () => {},),).not.toBeNull();
    expect(parseOr(HarnessSettingsNullable, null, null, () => {},),).toBeNull();
  });

  test("applySettings rebuilds rows and hasSubscriptionBacked reflects the rows", () => {
    const state = emptyHarnessSettingsState();
    applySettings(state, SETTINGS as never,);
    expect(state.harnessProfileRows,).toHaveLength(2,);
    expect(hasSubscriptionBacked(state,),).toBe(true,);

    applySettings(state, { enabled: false, profiles: [SETTINGS.profiles[0]!,], } as never,);
    expect(hasSubscriptionBacked(state,),).toBe(false,);
  });

  test("applyHarnessSettings PUTs a direct patch and re-applies the view", async () => {
    const state = await loadedState();
    let seenBody: unknown = null;
    handler = async (_url, opts,) => {
      seenBody = JSON.parse(String(opts?.body ?? "{}",),);
      return Response.json(SETTINGS,);
    };

    await applyHarnessSettings(state, { acknowledgements: { "cc-sub": true, }, },);

    expect(seenBody,).toEqual({ acknowledgements: { "cc-sub": true, }, },);
    expect(state.harnessSettingsError,).toBe("",);
    expect(state.harnessProfileRows,).toHaveLength(2,);
  });
});

/** State pre-loaded with the two-profile SETTINGS fixture. */
async function loadedState(): Promise<SettingsState> {
  handler = async (url,) => {
    if (url === "/api/v1/harness/settings") { return Response.json(SETTINGS,); }
    return new Response("", { status: 404, },);
  };

  const state = emptyHarnessSettingsState();
  await loadHarnessSettings(state,);
  return state;
}

describe("enable toggle + ToS modal", () => {
  test("enabling with a subscription-backed profile opens the modal and applies nothing", async () => {
    const state = await loadedState();

    onHarnessToggle(state,);

    expect(state.harnessAckModalOpen,).toBe(true,);
    expect(state.harnessToggleIntent,).toBe(true,);
    expect(state.harnessSettingsEnabled,).toBe(false,);
    expect(calls,).toEqual(["/api/v1/harness/settings",],);
  });

  test("declining closes the modal, sends nothing, and leaves the toggle off", async () => {
    const state = await loadedState();
    onHarnessToggle(state,);

    declineHarnessAck(state,);

    expect(state.harnessAckModalOpen,).toBe(false,);
    expect(state.harnessSettingsEnabled,).toBe(false,);
    expect(state.harnessToggleIntent,).toBe(false,);
    expect(calls,).toEqual(["/api/v1/harness/settings",],);
  });

  test("confirming PUTs the enable flag plus acknowledgements for subscription-backed profiles only", async () => {
    const state = await loadedState();
    onHarnessToggle(state,);
    let seenBody: unknown = null;
    const acked = SETTINGS.profiles.map((p,) => ({ ...p, tosGrayzoneAcknowledged: p.subscriptionBacked, }));
    handler = async (_url, opts,) => {
      seenBody = JSON.parse(String(opts?.body ?? "{}",),);
      return Response.json({ ...SETTINGS, enabled: true, profiles: acked, },);
    };

    await confirmHarnessAck(state,);

    expect(seenBody,).toEqual({ enabled: true, acknowledgements: { "cc-sub": true, }, },);
    expect(state.harnessAckModalOpen,).toBe(false,);
    expect(state.harnessSettingsEnabled,).toBe(true,);
    expect(state.harnessProfileRows.find((r,) => r.name === "cc-sub")?.acknowledged,).toBe(true,);
    expect(state.harnessProfileRows.find((r,) => r.name === "omp-main")?.acknowledged,).toBe(false,);
  });

  test("re-confirming the same acknowledgement is idempotent (same PUT body)", async () => {
    const state = await loadedState();
    onHarnessToggle(state,);
    const bodies: unknown[] = [];
    const acked = SETTINGS.profiles.map((p,) => ({ ...p, tosGrayzoneAcknowledged: p.subscriptionBacked, }));
    handler = async (_url, opts,) => {
      bodies.push(JSON.parse(String(opts?.body ?? "{}",),),);
      return Response.json({ ...SETTINGS, enabled: true, profiles: acked, },);
    };

    await confirmHarnessAck(state,);
    state.harnessToggleIntent = true;
    state.harnessAckModalOpen = true;
    await confirmHarnessAck(state,);

    expect(bodies,).toEqual([
      { enabled: true, acknowledgements: { "cc-sub": true, }, },
      { enabled: true, acknowledgements: { "cc-sub": true, }, },
    ],);
  });

  test("disabling never opens the modal and PUTs enabled false", async () => {
    const state = await loadedState();
    state.harnessSettingsEnabled = true;
    let seenBody: unknown = null;
    handler = async (_url, opts,) => {
      seenBody = JSON.parse(String(opts?.body ?? "{}",),);
      return Response.json({ ...SETTINGS, enabled: false, },);
    };

    await onHarnessToggle(state,);

    expect(state.harnessAckModalOpen,).toBe(false,);
    expect(seenBody,).toEqual({ enabled: false, },);
    expect(state.harnessSettingsEnabled,).toBe(false,);
  });

  test("an all-local/API setup enables directly without a modal", async () => {
    handler = async () => Response.json({ ...SETTINGS, profiles: [SETTINGS.profiles[0] as never,], },);
    const state = emptyHarnessSettingsState();
    await loadHarnessSettings(state,);
    let seenBody: unknown = null;
    handler = async (_url, opts,) => {
      seenBody = JSON.parse(String(opts?.body ?? "{}",),);
      return Response.json({ ...SETTINGS, enabled: true, profiles: [SETTINGS.profiles[0] as never,], },);
    };

    await onHarnessToggle(state,);

    expect(state.harnessAckModalOpen,).toBe(false,);
    expect(seenBody,).toEqual({ enabled: true, },);
    expect(state.harnessSettingsEnabled,).toBe(true,);
  });

  test("a failed save surfaces the error and leaves the toggle off", async () => {
    const state = await loadedState();
    onHarnessToggle(state,);
    handler = async () => new Response("", { status: 500, },);

    await confirmHarnessAck(state,);

    expect(state.harnessSettingsError,).not.toBe("",);
    expect(state.harnessSettingsEnabled,).toBe(false,);
  });
});
