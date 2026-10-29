// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AssetView (pi-tui): sidebar rendering + Left/Right/Enter behaviour, driven
 * through the setFetch seam. Pure component — render(width), handleInput(raw).
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { safeFetch, } from "../utils";
import type { FetchResult, SafeFetchOptions, } from "../utils/safe-fetch/types";
import { AssetView, setFetch, } from "./asset-view";
import type { LinkedAsset, } from "./asset-view";
import { stripRows, tick, } from "./test-support";

interface ClientCall {
  url: string;
  options: SafeFetchOptions;
}

const calls: ClientCall[] = [];

const ONE_ASSET: LinkedAsset = {
  id: "a-1",
  filename: "portrait.png",
  mime_type: "image/png",
  asset_type: "image",
  size_bytes: 10,
  alt_text: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const TWO_ASSETS: LinkedAsset[] = [
  ONE_ASSET,
  { ...ONE_ASSET, id: "a-2", filename: "scene.jpg", asset_type: "video", size_bytes: 2_048, },
];

/** Answer the assets list call with `body`. */
function stubAssets(body: LinkedAsset[] | undefined,): void {
  setFetch(<T,>(url: string, options?: SafeFetchOptions,): Promise<FetchResult<T>> => {
    calls.push({ url, options: options ?? {}, },);
    return Promise.resolve({
      ok: true,
      data: { data: body, } as T,
      status: 200,
      headers: new Headers(),
    },);
  },);
}

/** Answer with an HTTP failure. */
function stubFailure(status: number,): void {
  setFetch(<T,>(_url: string, _options?: SafeFetchOptions,): Promise<FetchResult<T>> =>
    Promise.resolve({
      ok: false,
      error: new Error("boom",),
      status,
      headers: new Headers(),
    },)
  );
}

afterEach(() => {
  calls.length = 0;
  setFetch(safeFetch,);
},);

describe("AssetView", () => {
  it("loads assets for the chat with the session token attached", async () => {
    stubAssets([ONE_ASSET,],);
    const view = new AssetView({ sessionToken: "tok", },);
    view.setChatId("chat-1",);
    await tick();

    expect(calls[0]?.url,).toContain("entity_type=chat&entity_id=chat-1",);
    expect(calls[0]?.options.auth,).toEqual({ sessionToken: "tok", },);
  });

  it("renders nothing while hidden and the framed sidebar once shown", async () => {
    stubAssets([ONE_ASSET,],);
    const view = new AssetView({},);
    expect(view.render(30,),).toEqual([],);

    view.setChatId("chat-1",);
    await tick();
    view.show();

    const rows = stripRows(view.render(30,),);
    expect(rows[0],).toContain("Assets",);
    expect(rows.join("\n",),).toContain("Name: portrait.png",);
    expect(rows.join("\n",),).toContain("MIME: image/png",);
    expect(rows.join("\n",),).toContain("10 B",);
    expect(rows.join("\n",),).toContain("Added: 2026-01-01",);
    expect(view.isVisible(),).toBe(true,);
  });

  it("shows the alt-text row only when an alt text exists", async () => {
    stubAssets([{ ...ONE_ASSET, alt_text: "a portrait", },],);
    const view = new AssetView({},);
    view.setChatId("chat-1",);
    await tick();
    view.show();

    const rows = stripRows(view.render(30,),).join("\n",);
    expect(rows,).toContain("Alt: a portrait",);
  });

  it("cycles assets with Left/Right and wraps", async () => {
    stubAssets(TWO_ASSETS,);
    const view = new AssetView({},);
    view.setChatId("chat-1",);
    await tick();
    view.show();

    expect(view.getCurrentAsset()?.id,).toBe("a-1",);
    view.handleInput("\x1b[C",);
    expect(view.getCurrentAsset()?.id,).toBe("a-2",);
    view.handleInput("\x1b[C",);
    expect(view.getCurrentAsset()?.id,).toBe("a-1",);
    view.handleInput("\x1b[D",);
    expect(view.getCurrentAsset()?.id,).toBe("a-2",);
  });

  it("Enter attaches the highlighted asset and reloads", async () => {
    let links = 0;
    setFetch(<T,>(url: string, options?: SafeFetchOptions,): Promise<FetchResult<T>> => {
      calls.push({ url, options: options ?? {}, },);
      if (url.endsWith("/links",)) {
        links++;
        return Promise.resolve({ ok: true, data: {} as T, status: 201, headers: new Headers(), },);
      }

      return Promise.resolve({
        ok: true,
        data: { data: TWO_ASSETS, } as T,
        status: 200,
        headers: new Headers(),
      },);
    },);

    const view = new AssetView({},);
    view.setChatId("chat-1",);
    await tick();
    view.show();
    view.handleInput("\r",);
    await tick();

    expect(links,).toBe(1,);
    expect(calls.some((call,) => call.url.endsWith("/links",)),).toBe(true,);
  });

  it("attach without an active chat reports instead of calling the API", async () => {
    const view = new AssetView({},);
    view.show();
    const attached = await view.attachAsset("a-1",);
    expect(attached,).toBe(false,);
    expect(calls,).toEqual([],);
  });

  it("degrades the sidebar to an HTTP failure message", async () => {
    stubFailure(500,);
    const view = new AssetView({},);
    view.setChatId("chat-1",);
    await tick();
    view.show();

    expect(stripRows(view.render(30,),).join("\n",),).toContain("Failed to load (HTTP 500)",);
  });

  it("reports no active chat before any chat is bound", async () => {
    const view = new AssetView({},);
    view.show();
    await view.loadAssets();
    expect(stripRows(view.render(30,),).join("\n",),).toContain("No active chat.",);
  });

  it("toggle flips visibility", () => {
    const view = new AssetView({},);
    view.toggle();
    expect(view.isVisible(),).toBe(true,);
    view.toggle();
    expect(view.isVisible(),).toBe(false,);
  });

  it("formats sizes through KB and MB", async () => {
    stubAssets([{ ...ONE_ASSET, size_bytes: 5 * 1024 * 1024, },],);
    const view = new AssetView({},);
    view.setChatId("chat-1",);
    await tick();
    view.show();
    expect(stripRows(view.render(40,),).join("\n",),).toContain("5.0 MB",);
  });
});
