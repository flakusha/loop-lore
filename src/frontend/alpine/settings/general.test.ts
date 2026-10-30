// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the settings "general" Alpine mixin (src/frontend/alpine/settings/general.ts).
 *
 * The mixin talks to the server through the ambient `apiFetch` global and
 * reads preferences through `storageGet` (localStorage). bun has no DOM and
 * no localStorage, so the globals are stubbed per test — same convention as
 * admin-import-wizard.test.ts.
 */
import "../i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { t, } from "../i18n";
import { general, } from "./general";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

interface Consent {
  nsfwEnabled: boolean;
  maxRating: string;
  accessStatus: string;
  shadowNsfw: boolean;
  blockReason: string | null;
}

interface Host {
  theme: string;
  locale: string;
  enterToSend: boolean;
  autoScroll: boolean;
  inlinePreview: boolean;
  localInferenceOptIn: boolean;
  detailLevel: string;
  temperature: number;
  locales: { id: string; name: string; nativeName: string; direction: string }[];
  providerList: { name: string; label: string; status: string }[];
  displayName: string;
  birthDate: string;
  confirmDeleteText: string;
  loaded: boolean;
  nsfwConsent: Consent | null;
  persistedPayloads: Record<string, unknown>[];
  pendingRestartLoads: number;
  persistSettings(payload: Record<string, unknown>,): Promise<void>;
  loadPendingRestart(): Promise<void>;
  quotaStateLoads: number;
  loadQuotaState(): Promise<void>;
  init(): Promise<void>;
  loadLocales(): Promise<void>;
  loadSettings(): Promise<void>;
  loadProviders(): Promise<void>;
  loadNsfwConsent(): Promise<void>;
  nsfwRestrictionText(): string;
  saveGeneral(): Promise<void>;
  onLocaleChange(): Promise<void>;
  exportAllData(): Promise<void>;
  onConfirmDeleteInput(): void;
  deleteAllData(): Promise<void>;
}

interface Call {
  url: string;
  opts?: RequestInit;
}

const globals = globalThis as unknown as Record<string, unknown>;
const originalApiFetch = globals.apiFetch;
const originalShowToast = globals.showToast;
const originalT = globals.t;
const originalConfirm = globalThis.confirm;
const originalDocument = globalThis.document;
const originalLocation = globalThis.location;
const originalLocalStorage = globalThis.localStorage;
const originalUserId = globalThis.__USER_ID;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

let calls: Call[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let toasts: { type: string; message: string }[] = [];
let confirmResult = true;
let confirmMessages: string[] = [];
let storage = new Map<string, string>();
let reloads = 0;
let clickedAnchors: { href: string; download: string }[] = [];
let appendedElements: unknown[] = [];
let deleteButton: { disabled: boolean } | null = null;

/**
 * A fake Storage backed by a Map — bun ships no localStorage.
 */
function installStorage(): void {
  globals.localStorage = {
    getItem: (key: string,) => storage.get(key,) ?? null,
    setItem: (key: string, value: string,) => void storage.set(key, String(value,),),
    removeItem: (key: string,) => void storage.delete(key,),
    clear: () => storage.clear(),
    key: () => null,
    length: 0,
  };
}

/**
 * A fake Document with just the surface the mixin touches.
 */
function installDocument(): void {
  globals.document = {
    cookie: "",
    querySelector: (selector: string,) => (selector === "#delete-all-btn" ? deleteButton : null),
    createElement: (tag: string,) => {
      if (tag !== "a") { return { click: () => {}, }; }
      const anchor = {
        href: "",
        download: "",
        click: () => {
          clickedAnchors.push({ href: anchor.href, download: anchor.download, },);
        },
        remove: () => {},
      };

      return anchor;
    },
    body: {
      append: (el: unknown,) => void appendedElements.push(el,),
    },
  };
}

function freshHost(): Host {
  const host: Host = {
    theme: "default",
    locale: "en",
    enterToSend: true,
    autoScroll: true,
    inlinePreview: true,
    localInferenceOptIn: false,
    detailLevel: "Immersion",
    temperature: 1,
    locales: [],
    providerList: [],
    displayName: "",
    birthDate: "",
    confirmDeleteText: "",
    loaded: false,
    nsfwConsent: null,
    persistedPayloads: [],
    pendingRestartLoads: 0,
    persistSettings: async (payload: Record<string, unknown>,) => {
      host.persistedPayloads.push(payload,);
    },
    loadPendingRestart: async () => {
      host.pendingRestartLoads += 1;
    },
    quotaStateLoads: 0,
    loadQuotaState: async () => {
      host.quotaStateLoads += 1;
    },
    init: async () => {},
    loadLocales: async () => {},
    loadSettings: async () => {},
    loadProviders: async () => {},
    loadNsfwConsent: async () => {},
    nsfwRestrictionText: () => "",
    saveGeneral: async () => {},
    onLocaleChange: async () => {},
    exportAllData: async () => {},
    onConfirmDeleteInput: () => {},
    deleteAllData: async () => {},
  };

  // The mixin's own methods replace the placeholder stubs above.
  Object.assign(host, general(),);
  return host;
}

beforeEach(() => {
  calls = [];
  toasts = [];
  confirmResult = true;
  confirmMessages = [];
  storage = new Map<string, string>();
  reloads = 0;
  clickedAnchors = [];
  appendedElements = [];
  deleteButton = null;
  handler = async () => Response.json({},);

  globals.apiFetch = (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  globals.showToast = (type: string, message: string,) => {
    toasts.push({ type, message, },);
  };

  globals.t = t;
  globalThis.confirm = (message?: string,) => {
    confirmMessages.push(message ?? "",);
    return confirmResult;
  };

  globals.location = {
    reload: () => {
      reloads += 1;
    },
  };

  globalThis.__USER_ID = undefined;

  installStorage();
  installDocument();

  URL.createObjectURL = () => "blob:settings-export";
  URL.revokeObjectURL = () => {};
},);

afterEach(() => {
  globals.apiFetch = originalApiFetch;
  globals.showToast = originalShowToast;
  globals.t = originalT;
  globalThis.confirm = originalConfirm;
  globalThis.document = originalDocument;
  globalThis.location = originalLocation;
  globalThis.localStorage = originalLocalStorage;
  globalThis.__USER_ID = originalUserId;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
},);

// ── init ─────────────────────────────────────────────────────────────

describe("settings general init", () => {
  test("restores the six persisted preferences from localStorage", async () => {
    storage.set("theme-reference", "no-icons",);
    storage.set("locale", "fr",);
    storage.set("chat-enter-to-send", "0",);
    storage.set("chat-auto-scroll", "0",);
    storage.set("chat-inline-preview", "1",);
    storage.set("chat-detail-level", "Explicit",);

    const host = freshHost();
    await host.init();

    expect(host.theme,).toBe("no-icons",);
    expect(host.locale,).toBe("fr",);
    expect(host.enterToSend,).toBe(false,);
    expect(host.autoScroll,).toBe(false,);
    expect(host.inlinePreview,).toBe(true,);
    expect(host.detailLevel,).toBe("Explicit",);
  });

  test("keeps the defaults when nothing is persisted", async () => {
    const host = freshHost();
    await host.init();

    expect(host.theme,).toBe("default",);
    expect(host.locale,).toBe("en",);
    expect(host.enterToSend,).toBe(true,);
    expect(host.autoScroll,).toBe(true,);
    expect(host.inlinePreview,).toBe(true,);
    expect(host.detailLevel,).toBe("Immersion",);
  });

  test('an explicit "0" turns a boolean preference off', async () => {
    storage.set("chat-enter-to-send", "0",);
    storage.set("chat-auto-scroll", "0",);
    storage.set("chat-inline-preview", "0",);

    const host = freshHost();
    await host.init();

    expect(host.enterToSend,).toBe(false,);
    expect(host.autoScroll,).toBe(false,);
    expect(host.inlinePreview,).toBe(false,);
  });

  test("mirrors the local-inference opt-in flag", async () => {
    const host = freshHost();
    await host.init();
    expect(host.localInferenceOptIn,).toBe(false,);

    storage.set("local-inference-optin", "1",);
    const optedIn = freshHost();
    await optedIn.init();
    expect(optedIn.localInferenceOptIn,).toBe(true,);
  });

  test("loads locales, providers, settings, consent and the restart banner", async () => {
    handler = async (url: string,) => {
      if (url === "/api/v1/i18n/locales") { return Response.json({ locales: [{ id: "en", },], },); }
      if (url === "/api/v1/providers") { return Response.json({ providers: [], },); }
      if (url === "/api/v1/settings") { return Response.json({ displayName: "Ada", },); }
      return Response.json({},);
    };

    const host = freshHost();
    await host.init();

    const urls = calls.map((c,) => c.url);
    expect(urls,).toContain("/api/v1/i18n/locales",);
    expect(urls,).toContain("/api/v1/providers",);
    expect(urls,).toContain("/api/v1/settings",);
    expect(host.pendingRestartLoads,).toBe(1,);
    expect(host.quotaStateLoads,).toBe(1,);
  });
});

// ── loadLocales ──────────────────────────────────────────────────────

describe("settings general loadLocales", () => {
  test("uses the locales the server returns", async () => {
    handler = async () =>
      Response.json({
        locales: [{ id: "en", name: "English", nativeName: "English", direction: "ltr", },],
      },);

    const host = freshHost();
    await host.loadLocales();

    expect(host.locales.length,).toBe(1,);
    expect(host.locales[0]?.id,).toBe("en",);
  });

  test("falls back to the built-in locale list when the request throws", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const host = freshHost();
    await host.loadLocales();

    expect(host.locales.length,).toBe(10,);
    expect(host.locales[0]?.id,).toBe("en",);
    expect(host.locales.map((l,) => l.id),).toContain("ru",);
    const arabic = host.locales.find((l,) => l.id === "ar");
    expect(arabic?.direction,).toBe("rtl",);
    expect(arabic?.nativeName,).toBe("العربية",);
  });

  test("leaves the locale list untouched when the server answers with an error", async () => {
    handler = async () => new Response("nope", { status: 500, },);

    const host = freshHost();
    host.locales = [{ id: "de", name: "German", nativeName: "Deutsch", direction: "ltr", },];
    await host.loadLocales();

    expect(host.locales.length,).toBe(1,);
    expect(host.locales[0]?.id,).toBe("de",);
  });
});

// ── loadSettings ─────────────────────────────────────────────────────

describe("settings general loadSettings", () => {
  test("applies the stored settings", async () => {
    handler = async () =>
      Response.json({
        displayName: "Ada",
        birthDate: "1990-01-02",
        theme: "no-icons",
        locale: "de",
        provider: "Local",
        apiEndpoint: "http://localhost:1234",
        model: "gpt",
        maxTokens: 4096,
        detailLevel: "Explicit",
        temperature: 0.4,
      },);

    const host = freshHost();
    await host.loadSettings();

    expect(host.displayName,).toBe("Ada",);
    expect(host.birthDate,).toBe("1990-01-02",);
    expect(host.theme,).toBe("no-icons",);
    expect(host.locale,).toBe("de",);
    expect(host.detailLevel,).toBe("Explicit",);
    expect(host.temperature,).toBe(0.4,);
    expect(host.loaded,).toBe(true,);
  });

  test("only trusts real booleans for the chat flags", async () => {
    handler = async () =>
      Response.json({
        enterToSend: "false",
        autoScroll: false,
        inlinePreview: true,
      },);

    const host = freshHost();
    host.enterToSend = true;
    await host.loadSettings();

    expect(host.enterToSend,).toBe(true,);
    expect(host.autoScroll,).toBe(false,);
    expect(host.inlinePreview,).toBe(true,);
  });

  test("marks the settings as loaded even when the request fails", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const host = freshHost();
    await host.loadSettings();

    expect(host.loaded,).toBe(true,);
    expect(host.displayName,).toBe("",);
  });
});

// ── loadProviders ────────────────────────────────────────────────────

describe("settings general loadProviders", () => {
  test("keeps only the healthy providers", async () => {
    handler = async () =>
      Response.json({
        providers: [
          { name: "ok", label: "OK", status: "healthy", },
          { name: "down", label: "Down", status: "unhealthy", },
          { name: "unknown", label: "Unknown", status: "unknown", },
        ],
      },);

    const host = freshHost();
    await host.loadProviders();

    expect(host.providerList.length,).toBe(1,);
    expect(host.providerList[0]?.name,).toBe("ok",);
  });

  test("an empty provider list is stored as an empty list", async () => {
    handler = async () => Response.json({},);

    const host = freshHost();
    await host.loadProviders();

    expect(host.providerList,).toEqual([],);
  });
});

// ── loadNsfwConsent ──────────────────────────────────────────────────

describe("settings general loadNsfwConsent", () => {
  test("does nothing without a signed-in user", async () => {
    const host = freshHost();
    await host.loadNsfwConsent();

    expect(calls.length,).toBe(0,);
    expect(host.nsfwConsent,).toBeNull();
  });

  test("loads the consent state of the signed-in user", async () => {
    globalThis.__USER_ID = "user-1";
    handler = async () =>
      Response.json({
        data: {
          nsfwEnabled: true,
          maxRating: "pg13",
          accessStatus: "blocked",
          shadowNsfw: true,
          blockReason: "policy",
        },
      },);

    const host = freshHost();
    await host.loadNsfwConsent();

    expect(calls[0]?.url,).toBe("/api/v1/nsfw/moderation/preferences/user-1",);
    expect(host.nsfwConsent?.nsfwEnabled,).toBe(true,);
    expect(host.nsfwConsent?.maxRating,).toBe("pg13",);
    expect(host.nsfwConsent?.accessStatus,).toBe("blocked",);
    expect(host.nsfwConsent?.shadowNsfw,).toBe(true,);
    expect(host.nsfwConsent?.blockReason,).toBe("policy",);
  });

  test("encodes the user id in the request path", async () => {
    globalThis.__USER_ID = "a b";
    handler = async () => Response.json({ data: {}, },);

    const host = freshHost();
    await host.loadNsfwConsent();

    expect(calls[0]?.url,).toBe("/api/v1/nsfw/moderation/preferences/a%20b",);
  });

  test("falls back to safe defaults for missing or wrongly typed fields", async () => {
    globalThis.__USER_ID = "user-1";
    handler = async () => Response.json({ data: { nsfwEnabled: "yes", maxRating: 7, shadowNsfw: 1, }, },);

    const host = freshHost();
    await host.loadNsfwConsent();

    expect(host.nsfwConsent?.nsfwEnabled,).toBe(false,);
    expect(host.nsfwConsent?.maxRating,).toBe("",);
    expect(host.nsfwConsent?.accessStatus,).toBe("clear",);
    expect(host.nsfwConsent?.shadowNsfw,).toBe(false,);
    expect(host.nsfwConsent?.blockReason,).toBeNull();
  });

  test("keeps the previous consent when the response carries no data", async () => {
    globalThis.__USER_ID = "user-1";
    handler = async () => Response.json({},);

    const host = freshHost();
    await host.loadNsfwConsent();

    expect(host.nsfwConsent,).toBeNull();
  });
});

// ── nsfwRestrictionText ──────────────────────────────────────────────

describe("settings general nsfwRestrictionText", () => {
  test("is empty without a consent state", () => {
    const host = freshHost();
    expect(host.nsfwRestrictionText(),).toBe("",);
  });

  test("reports a blocked account", () => {
    const host = freshHost();
    host.nsfwConsent = {
      nsfwEnabled: false,
      maxRating: "",
      accessStatus: "blocked",
      shadowNsfw: false,
      blockReason: null,
    };

    expect(host.nsfwRestrictionText(),).toBe("Blocked",);
  });

  test("reports a banned account", () => {
    const host = freshHost();
    host.nsfwConsent = {
      nsfwEnabled: false,
      maxRating: "",
      accessStatus: "banned",
      shadowNsfw: false,
      blockReason: null,
    };

    expect(host.nsfwRestrictionText(),).toBe("Banned",);
  });

  test("reports a shadow restriction", () => {
    const host = freshHost();
    host.nsfwConsent = {
      nsfwEnabled: true,
      maxRating: "",
      accessStatus: "clear",
      shadowNsfw: true,
      blockReason: null,
    };

    expect(host.nsfwRestrictionText(),).toBe("Shadow-restricted",);
  });

  test("joins several restrictions and appends the block reason", () => {
    const host = freshHost();
    host.nsfwConsent = {
      nsfwEnabled: false,
      maxRating: "",
      accessStatus: "blocked",
      shadowNsfw: true,
      blockReason: "policy",
    };

    expect(host.nsfwRestrictionText(),).toBe("Blocked, Shadow-restricted — policy",);
  });

  test("reports no restriction for a clear account", () => {
    const host = freshHost();
    host.nsfwConsent = {
      nsfwEnabled: true,
      maxRating: "",
      accessStatus: "clear",
      shadowNsfw: false,
      blockReason: null,
    };

    expect(host.nsfwRestrictionText(),).toBe("None",);
  });
});

// ── saveGeneral ──────────────────────────────────────────────────────

describe("settings general saveGeneral", () => {
  test("persists the general preferences", async () => {
    const host = freshHost();
    host.displayName = "Ada";
    host.birthDate = "1990-01-02";
    host.theme = "no-icons";
    host.locale = "de";

    await host.saveGeneral();

    expect(host.persistedPayloads.length,).toBe(1,);
    expect(host.persistedPayloads[0],).toEqual({
      displayName: "Ada",
      birthDate: "1990-01-02",
      theme: "no-icons",
      locale: "de",
    },);
  });
});

// ── onLocaleChange ───────────────────────────────────────────────────

describe("settings general onLocaleChange", () => {
  test("saves the choice, sets the cookie and reloads", async () => {
    const host = freshHost();
    host.locale = "fr";

    await host.onLocaleChange();

    expect(host.persistedPayloads[0]?.locale,).toBe("fr",);
    expect((globals.document as { cookie: string }).cookie,).toBe(
      "ll_locale=fr; path=/; SameSite=Lax; max-age=31536000",
    );

    expect(reloads,).toBe(1,);
  });
});

// ── exportAllData ────────────────────────────────────────────────────

describe("settings general exportAllData", () => {
  test("downloads the export archive and confirms with a toast", async () => {
    handler = async () => new Response("zip-bytes", { status: 200, },);

    const host = freshHost();
    await host.exportAllData();

    expect(calls[0]?.url,).toBe("/api/v1/settings/export",);
    expect(clickedAnchors.length,).toBe(1,);
    expect(clickedAnchors[0]?.download,).toBe("loop-lore-export.zip",);
    expect(appendedElements.length,).toBe(1,);
    expect(toasts[0],).toEqual({ type: "success", message: "Export downloaded", },);
  });

  test("reports a failed export without downloading anything", async () => {
    handler = async () => new Response("nope", { status: 500, },);

    const host = freshHost();
    await host.exportAllData();

    expect(toasts[0],).toEqual({ type: "error", message: "Export failed", },);
    expect(clickedAnchors.length,).toBe(0,);
  });

  test("reports a failed export when the request throws", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const host = freshHost();
    await host.exportAllData();

    expect(toasts[0],).toEqual({ type: "error", message: "Export failed", },);
  });
});

// ── onConfirmDeleteInput ─────────────────────────────────────────────

describe("settings general onConfirmDeleteInput", () => {
  test("keeps the delete button disabled until the phrase is typed", () => {
    deleteButton = { disabled: false, };

    const host = freshHost();
    host.confirmDeleteText = "DEL";
    host.onConfirmDeleteInput();
    expect(deleteButton.disabled,).toBe(true,);

    host.confirmDeleteText = "DELETE";
    host.onConfirmDeleteInput();
    expect(deleteButton.disabled,).toBe(false,);
  });

  test("does not fail when the button is absent", () => {
    deleteButton = null;

    const host = freshHost();
    expect(() => host.onConfirmDeleteInput()).not.toThrow();
  });
});

// ── deleteAllData ────────────────────────────────────────────────────

describe("settings general deleteAllData", () => {
  test("does nothing until the phrase is typed", async () => {
    const host = freshHost();
    host.confirmDeleteText = "delete";

    await host.deleteAllData();

    expect(calls.length,).toBe(0,);
    expect(confirmMessages.length,).toBe(0,);
  });

  test("does nothing when the confirmation is declined", async () => {
    confirmResult = false;
    const host = freshHost();
    host.confirmDeleteText = "DELETE";

    await host.deleteAllData();

    expect(calls.length,).toBe(0,);
    expect(confirmMessages[0],).toContain("permanently delete ALL your data",);
  });

  test("deletes the account when confirmed", async () => {
    const host = freshHost();
    host.confirmDeleteText = "DELETE";

    await host.deleteAllData();

    expect(calls[0]?.url,).toBe("/api/v1/users/me",);
    expect(calls[0]?.opts?.method,).toBe("DELETE",);
  });

  test("a failed delete is swallowed", async () => {
    handler = async () => new Response("nope", { status: 500, },);

    const host = freshHost();
    host.confirmDeleteText = "DELETE";

    await host.deleteAllData();

    expect(calls.length,).toBe(1,);
  });
});
