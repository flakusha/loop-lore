// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Edge-case tests for characters-proactive.ts: chatId resolution (both
 * casings), config field population with defaults, quiet-hours null
 * coercion, and save/load failure paths.
 *
 * The module under test is imported dynamically: initProactive must run
 * with the stub fetch before the globalThis handlers are exercised
 * (module-loading boundary).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";

type ProactiveField = {
  textContent: string;
  value: string;
  checked: boolean;
};

function field(): ProactiveField {
  return { textContent: "", value: "", checked: false, };
}

const realDoc = globalThis.document;
const realLoc = (globalThis as { location?: unknown }).location;

let selectors: Map<string, ProactiveField>;
let fetchCalls: { url: string; opts?: RequestInit }[];
let fetchHandler: (url: string, opts?: RequestInit,) => Promise<Response>;
let locSearch = "";

function registerFields(): {
  status: ProactiveField;
  freq: ProactiveField;
  enabled: ProactiveField;
  qs: ProactiveField;
  qe: ProactiveField;
} {
  const status = field();
  const freq = field();
  const enabled = field();
  const qs = field();
  const qe = field();
  selectors.set("#proactive-status", status,);
  selectors.set("#proactive-frequency", freq,);
  selectors.set("#proactive-enabled", enabled,);
  selectors.set("#proactive-quiet-start", qs,);
  selectors.set("#proactive-quiet-end", qe,);
  return { status, freq, enabled, qs, qe, };
}

const jsonResponse = (body: unknown, status = 200,): Response => new Response(JSON.stringify(body,), { status, },);

beforeEach(async () => {
  selectors = new Map();
  fetchCalls = [];
  fetchHandler = async () => jsonResponse({},);
  locSearch = "";
  (globalThis as { document: unknown }).document = {
    querySelector: (sel: string,) => selectors.get(sel,) ?? null,
  };
  (globalThis as { location: unknown }).location = {
    get search() {
      return locSearch;
    },
  };
  const { initProactive, } = await import("./characters-proactive");
  initProactive(async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts, },);
    return fetchHandler(url, opts,);
  },);
},);

afterEach(() => {
  (globalThis as { document: unknown }).document = realDoc;
  (globalThis as { location: unknown }).location = realLoc;
},);

// ── loadProactiveConfig ────────────────────────────────────

describe("loadProactiveConfig", () => {
  test("no chatid → status hint, no fetch", async () => {
    locSearch = "";
    const { status, } = registerFields();
    await (globalThis as unknown as { loadProactiveConfig: (id: string,) => Promise<void> }).loadProactiveConfig(
      "actor1",
    );
    expect(status.textContent,).toBe("Configure from a chat session to set proactive messaging.",);
    expect(fetchCalls,).toEqual([],);
  });

  test("chatid param → fetches config and populates fields", async () => {
    locSearch = "?chatid=abc";
    fetchHandler = async () =>
      jsonResponse({ frequency: "rarely", enabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00", },);
    const { freq, enabled, qs, qe, } = registerFields();
    await (globalThis as unknown as { loadProactiveConfig: (id: string,) => Promise<void> }).loadProactiveConfig(
      "actor1",
    );
    expect(fetchCalls[0]?.url,).toBe("/api/v1/proactive-messaging/config?chatId=abc&actorId=actor1",);
    expect(freq.value,).toBe("rarely",);
    expect(enabled.checked,).toBe(true,);
    expect(qs.value,).toBe("22:00",);
    expect(qe.value,).toBe("07:00",);
  });

  test("chatId (capital) param also resolves", async () => {
    locSearch = "?chatId=xyz";
    registerFields();
    await (globalThis as unknown as { loadProactiveConfig: (id: string,) => Promise<void> }).loadProactiveConfig(
      "actor1",
    );
    expect(fetchCalls[0]?.url,).toContain("chatId=xyz",);
  });

  test("missing frequency falls back to normal; enabled false unchecks; quiet hours untouched", async () => {
    locSearch = "?chatid=abc";
    fetchHandler = async () => jsonResponse({ enabled: false, },);
    const { freq, enabled, qs, qe, } = registerFields();
    qs.value = "23:00";
    qe.value = "06:00";
    await (globalThis as unknown as { loadProactiveConfig: (id: string,) => Promise<void> }).loadProactiveConfig(
      "actor1",
    );
    expect(freq.value,).toBe("normal",);
    expect(enabled.checked,).toBe(false,);
    expect(qs.value,).toBe("23:00",);
    expect(qe.value,).toBe("06:00",);
  });

  test("non-ok response leaves fields untouched", async () => {
    locSearch = "?chatid=abc";
    fetchHandler = async () => jsonResponse({}, 404,);
    const { freq, } = registerFields();
    freq.value = "normal";
    await (globalThis as unknown as { loadProactiveConfig: (id: string,) => Promise<void> }).loadProactiveConfig(
      "actor1",
    );
    expect(freq.value,).toBe("normal",);
  });

  test("fetch throw is swallowed", async () => {
    locSearch = "?chatid=abc";
    fetchHandler = async () => {
      throw new Error("net",);
    };
    registerFields();
    await expect(
      (globalThis as unknown as { loadProactiveConfig: (id: string,) => Promise<void> }).loadProactiveConfig("actor1",),
    ).resolves.toBeUndefined();
  });

  test("missing status element is tolerated", async () => {
    locSearch = "";
    await expect(
      (globalThis as unknown as { loadProactiveConfig: (id: string,) => Promise<void> }).loadProactiveConfig("actor1",),
    ).resolves.toBeUndefined();
  });
});

// ── saveProactiveConfig ────────────────────────────────────

describe("saveProactiveConfig", () => {
  test("no chatid → false, no fetch", async () => {
    locSearch = "";
    registerFields();
    const result = await (globalThis as unknown as { saveProactiveConfig: (id: string,) => Promise<boolean> })
      .saveProactiveConfig("actor1",);
    expect(result,).toBe(false,);
    expect(fetchCalls,).toEqual([],);
  });

  test("ok → true, updated status, PUT body with null quiet hours", async () => {
    locSearch = "?chatid=abc";
    const { status, freq, enabled, qs, qe, } = registerFields();
    freq.value = "rarely";
    enabled.checked = true;
    qs.value = "";
    qe.value = "";
    const result = await (globalThis as unknown as { saveProactiveConfig: (id: string,) => Promise<boolean> })
      .saveProactiveConfig("actor1",);
    expect(result,).toBe(true,);
    expect(status.textContent,).toBe("Proactive messaging updated.",);
    expect(fetchCalls[0]?.url,).toBe("/api/v1/proactive-messaging/config?chatId=abc&actorId=actor1",);
    expect(fetchCalls[0]?.opts?.method,).toBe("PUT",);
    const body = JSON.parse(String(fetchCalls[0]?.opts?.body,),) as Record<string, unknown>;
    expect(body,).toEqual({ frequency: "rarely", enabled: true, quietHoursStart: null, quietHoursEnd: null, },);
  });

  test("unchecked enabled → false in body", async () => {
    locSearch = "?chatid=abc";
    const { enabled, } = registerFields();
    enabled.checked = false;
    await (globalThis as unknown as { saveProactiveConfig: (id: string,) => Promise<boolean> }).saveProactiveConfig(
      "actor1",
    );
    const body = JSON.parse(String(fetchCalls[0]?.opts?.body,),) as Record<string, unknown>;
    expect(body.enabled,).toBe(false,);
  });

  test("non-ok → false + failure status", async () => {
    locSearch = "?chatid=abc";
    fetchHandler = async () => jsonResponse({}, 500,);
    const { status, } = registerFields();
    const result = await (globalThis as unknown as { saveProactiveConfig: (id: string,) => Promise<boolean> })
      .saveProactiveConfig("actor1",);
    expect(result,).toBe(false,);
    expect(status.textContent,).toBe("Failed to save proactive messaging.",);
  });

  test("throw → false + failure status", async () => {
    locSearch = "?chatid=abc";
    fetchHandler = async () => {
      throw new Error("net",);
    };
    const { status, } = registerFields();
    const result = await (globalThis as unknown as { saveProactiveConfig: (id: string,) => Promise<boolean> })
      .saveProactiveConfig("actor1",);
    expect(result,).toBe(false,);
    expect(status.textContent,).toBe("Failed to save proactive messaging.",);
  });
});
