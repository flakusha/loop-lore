// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the per-message translate control (message-translate.ts): the
// display-locale resolution, the POST to the translations route, the skipped /
// failed / network-error degradations, and the cached variant lookup.
//
// apiFetch is imported from ./htmx as a direct ESM binding, so it is mocked
// module-wise (same pattern as message-search.test.ts) — the mock is installed
// only under per-file isolation, where a module registry cannot leak into
// sibling files.
import "./i18n.test-helper";
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { messageTranslate, } from "./message-translate";

interface FetchCall {
  url: string;
  opts: RequestInit | undefined;
}

let calls: FetchCall[] = [];
let handler: (url: string, opts?: RequestInit,) => Response | Promise<Response> = () => Response.json({},);

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      calls.push({ url, opts, },);
      return handler(url, opts,);
    },
  }),);
}

/** The slice members this file exercises, bound to a host at call time. */
interface TranslateScope {
  _mtBusy: string;
  _mtText: Record<string, { locale: string; content: string }>;
  mtLocale(): string;
  translateMessage(messageId: string,): Promise<void>;
  translationFor(messageId: string,): { locale: string; content: string } | null;
}

const scope = messageTranslate as unknown as TranslateScope;

const globalState = globalThis as unknown as {
  document?: { cookie?: string };
  showToast?: (type: string, message: string,) => void;
};

const originalToast = globalState.showToast;
const originalCookie = globalState.document?.cookie;

let toasts: { type: string; message: string }[] = [];

/** Fresh copy of the slice so the cached-variant map never leaks between tests. */
function freshHost(overrides: Partial<TranslateScope> = {},): TranslateScope {
  return {
    ...scope,
    _mtBusy: "",
    _mtText: {},
    ...overrides,
  };
}

beforeEach(() => {
  calls = [];
  toasts = [];
  handler = () => Response.json({},);
  if (globalState.document) { globalState.document.cookie = ""; }
  globalState.showToast = (type, message,) => {
    toasts.push({ type, message, },);
  };
},);

afterEach(() => {
  globalState.showToast = originalToast;
  if (globalState.document) { globalState.document.cookie = originalCookie ?? ""; }
},);

/**
 * @param url
 * @returns {Record<string, unknown>}
 */
function bodyOf(url: string,): Record<string, unknown> {
  const call = calls.find((c,) => c.url === url);
  if (typeof call?.opts?.body !== "string") { return {}; }
  return JSON.parse(call.opts.body,) as Record<string, unknown>;
}

describeOrSkip("messageTranslate.mtLocale", () => {
  test("defaults to en when no locale cookie is set", () => {
    const host = freshHost();
    expect(host.mtLocale(),).toBe("en",);
  });

  test("reads the ll_locale cookie", () => {
    if (globalState.document) { globalState.document.cookie = "ll_locale=fr"; }
    const host = freshHost();
    expect(host.mtLocale(),).toBe("fr",);
  });
},);

describeOrSkip("messageTranslate.translateMessage", () => {
  test("posts the resolved locale and caches the returned variant", async () => {
    handler = () => Response.json({ locale: "fr", content: "Bonjour", },);
    const host = freshHost();
    await host.translateMessage("m1",);

    expect(calls.length,).toBe(1,);
    expect(calls[0]!.url,).toBe("/api/v1/messages/m1/translations",);
    expect(calls[0]!.opts?.method,).toBe("POST",);
    expect(bodyOf("/api/v1/messages/m1/translations",),).toEqual({ locale: "en", },);
    expect(host._mtText["m1"],).toEqual({ locale: "fr", content: "Bonjour", },);
    expect(host._mtBusy,).toBe("",);
    expect(toasts,).toEqual([],);
  });

  test("sends the cookie locale in the request body", async () => {
    if (globalState.document) { globalState.document.cookie = "ll_locale=de"; }
    handler = () => Response.json({ locale: "de", content: "Hallo", },);
    const host = freshHost();
    await host.translateMessage("m1",);

    expect(bodyOf("/api/v1/messages/m1/translations",),).toEqual({ locale: "de", },);
  });

  test("encodes the message id into the route", async () => {
    handler = () => Response.json({ locale: "fr", content: "Bonjour", },);
    const host = freshHost();
    await host.translateMessage("a/b c",);

    expect(calls[0]!.url,).toBe("/api/v1/messages/a%2Fb%20c/translations",);
  });

  test("falls back to the resolved locale and empty content when the payload omits them", async () => {
    handler = () => Response.json({},);
    const host = freshHost();
    await host.translateMessage("m1",);

    expect(host._mtText["m1"],).toEqual({ locale: "en", content: "", },);
  });

  test("does nothing while another message is being translated", async () => {
    const host = freshHost({ _mtBusy: "m-other", },);
    await host.translateMessage("m1",);

    expect(calls,).toEqual([],);
    expect(toasts,).toEqual([],);
    expect(host._mtText,).toEqual({},);
  });

  test("reports a skipped translation without caching anything", async () => {
    handler = () => Response.json({ skipped: true, reason: "same-locale", },);
    const host = freshHost();
    await host.translateMessage("m1",);

    expect(toasts,).toEqual([{ type: "info", message: "Nothing to translate", },],);
    expect(host._mtText,).toEqual({},);
    expect(host._mtBusy,).toBe("",);
  });

  test("reports a failed response without caching anything", async () => {
    handler = () => Response.json({ error: "boom", }, { status: 500, },);
    const host = freshHost();
    await host.translateMessage("m1",);

    expect(toasts,).toEqual([{ type: "error", message: "Translation failed", },],);
    expect(host._mtText,).toEqual({},);
    expect(host._mtBusy,).toBe("",);
  });

  test("reports a network failure without caching anything", async () => {
    handler = () => {
      throw new Error("offline",);
    };

    const host = freshHost();
    await host.translateMessage("m1",);

    expect(toasts,).toEqual([{ type: "error", message: "Translation failed", },],);
    expect(host._mtText,).toEqual({},);
    expect(host._mtBusy,).toBe("",);
  });
},);

describeOrSkip("messageTranslate.translationFor", () => {
  test("returns null for a message with no cached variant", () => {
    const host = freshHost();
    expect(host.translationFor("m1",),).toBeNull();
  });

  test("returns the cached variant once translated", async () => {
    handler = () => Response.json({ locale: "fr", content: "Bonjour", },);
    const host = freshHost();
    await host.translateMessage("m1",);

    expect(host.translationFor("m1",),).toEqual({ locale: "fr", content: "Bonjour", },);
    expect(host.translationFor("m2",),).toBeNull();
  });
},);
