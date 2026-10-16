// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests that `AssetView.loadAssets` sends the `[tui].sessionToken` on the
 * `GET /api/v1/assets` call.
 *
 * The regression this pins: loadAssets called safeFetch with no `auth`, so on
 * any non-solo deployment the endpoint's user requirement rejected the request
 * and the F2 sidebar rendered `Failed to load (HTTP 401)`.
 *
 * The view is built from the prototype rather than `new AssetView(screen)`,
 * which would call `blessed.box()` and block outside a TTY. Only the plain
 * data loadAssets reads and writes is exercised, so the render helpers are
 * no-ops — no `mock.module`, no per-file isolation gate, so these tests run
 * under a bare `bun test src/tui/`.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { safeFetch, } from "../utils";
import type { FetchResult, SafeFetchOptions, } from "../utils/safe-fetch/types";
import { AssetView, setFetch, } from "./asset-view";
import type { LinkedAsset, } from "./asset-view";

const noop = (): void => {};

/** One recorded client call. */
interface ClientCall {
  url: string;
  options: SafeFetchOptions;
}

/** The private state loadAssets touches, as a flat record for assignment. */
interface LoadableView {
  chatId: string | null;
  assets: LinkedAsset[];
  currentIndex: number;
  sessionToken: string | undefined;
  renderInfo: (msg: string,) => void;
  renderCurrent: () => void;
  loadAssets: () => Promise<void>;
}

const calls: ClientCall[] = [];
const realFetch = safeFetch;

const ONE_ASSET: LinkedAsset = {
  id: "a-1",
  filename: "portrait.png",
  mime_type: "image/png",
  asset_type: "image",
  size_bytes: 10,
  alt_text: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

/** Answer every call with one asset so the success branch runs.
 *
 * Generic over the response body so it satisfies `setFetch`'s
 * `<T>(url, options?) => Promise<FetchResult<T>>` signature, the same shape
 * harness/api.test.ts's `makeMockSafeFetch<T>` uses. The cast is confined to
 * the double's return; the recorded call is what the tests assert on.
 */
function stubClient(): void {
  setFetch(<T,>(url: string, options?: SafeFetchOptions,): Promise<FetchResult<T>> => {
    calls.push({ url, options: options ?? {}, },);
    return Promise.resolve({
      ok: true,
      data: { data: [ONE_ASSET,], } as T,
      status: 200,
      headers: new Headers(),
    },);
  },);
}

/** Build a loadable view without running the blessed-touching constructor. */
function buildView(sessionToken?: string,): LoadableView {
  const view = Object.create(AssetView.prototype,) as LoadableView;
  view.chatId = "chat-1";
  view.assets = [];
  view.currentIndex = 0;
  view.sessionToken = sessionToken;
  view.renderInfo = noop;
  view.renderCurrent = noop;
  return view;
}

afterEach(() => {
  calls.length = 0;
  setFetch(realFetch,);
},);

describe("AssetView — loadAssets auth", () => {
  it("sends the session token as auth when one is supplied", async () => {
    stubClient();
    await buildView("tok-1",).loadAssets();

    expect(calls,).toHaveLength(1,);
    expect(calls[0]?.options.auth,).toEqual({ sessionToken: "tok-1", },);
  });

  it("omits auth entirely when no session token is supplied", async () => {
    stubClient();
    await buildView().loadAssets();

    expect(calls,).toHaveLength(1,);
    expect(calls[0]?.options.auth,).toBeUndefined();
  });

  it("normalizes an empty-string token to undefined rather than shipping a blank Bearer", async () => {
    stubClient();
    await buildView("",).loadAssets();

    expect(calls[0]?.options.auth,).toBeUndefined();
  });

  it("requests the chat-scoped asset list", async () => {
    stubClient();
    await buildView("tok-1",).loadAssets();

    expect(calls[0]?.url,).toContain("/api/v1/assets?entity_type=chat&entity_id=chat-1",);
  });

  it("does not call the client at all when no chat is bound", async () => {
    stubClient();
    const view = buildView("tok-1",);
    view.chatId = null;
    await view.loadAssets();

    expect(calls,).toHaveLength(0,);
  });
});
