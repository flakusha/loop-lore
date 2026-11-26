// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Async-ordering regression for the gallery asset preview: a slow response
 * for an earlier click must not open a stale asset after a newer click.
 */
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";

let feHandler: ((url: string,) => Response | Promise<Response>) | null = null;

if (ISOLATED) {
  mock.module("../fe-fetch", () => ({
    feFetch: async (url: string,) => feHandler ? feHandler(url,) : new Response("{}", { status: 404, },),
    getCsrfToken: () => "",
  }),);
}

// Static import would evaluate before the gated mock.module above; this test
// intentionally controls module-load order.
const { openAssetPreviewById, } = await import("./asset-preview-modal");

function jsonResponse(body: unknown,): Response {
  return new Response(JSON.stringify(body,), { status: 200, },);
}

interface OpenedAsset {
  id?: string;
  url?: string;
}

let opened: OpenedAsset[];
let toasts: string[];

const host = globalThis as unknown as Record<string, unknown>;
const originals: Record<string, unknown> = {
  document: host.document,
  Alpine: host.Alpine,
  HTMLElement: host.HTMLElement,
  showToast: host.showToast,
  t: host.t,
};

beforeEach(() => {
  opened = [];
  toasts = [];
  feHandler = null;

  const modal = {};
  host.document = {
    activeElement: null,
    querySelector: (selector: string,) => selector === "#asset-preview-modal" ? modal : null,
  };

  host.HTMLElement = class {};
  host.Alpine = {
    $data: () => ({ open: (asset: OpenedAsset,) => opened.push(asset,), }),
  };

  host.showToast = (type: string, message: string,) => {
    toasts.push(`${type}:${message}`,);
  };

  host.t = (key: string,) => key;
},);

afterEach(() => {
  for (const [key, value,] of Object.entries(originals,)) { host[key] = value; }
},);

describeOrSkip("openAssetPreviewById", () => {
  test("a slow earlier response cannot open a stale asset after a newer click", async () => {
    const old = Promise.withResolvers<Response>();
    const fresh = Promise.withResolvers<Response>();
    feHandler = (url,) => url === "/api/v1/assets/new" ? fresh.promise : old.promise;

    const oldRequest = openAssetPreviewById("old",);
    const newRequest = openAssetPreviewById("new",);

    fresh.resolve(jsonResponse({ id: "new", },),);
    await newRequest;
    old.resolve(jsonResponse({ id: "old", },),);
    await oldRequest;

    expect(opened.map((asset,) => asset.id),).toEqual(["new",],);
    expect(opened[0]!.url,).toBe("/api/v1/assets/new/raw",);
    expect(toasts,).toEqual([],);
  });
},);
