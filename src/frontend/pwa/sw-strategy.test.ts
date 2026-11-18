// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  CACHE_NAME_PREFIX,
  cacheName,
  classifyRequest,
  isShellAssetPath,
  PRECACHE_URLS,
  RUNTIME_CACHE_PREFIXES,
  shouldServeOfflinePage,
  strategyFor,
  SW_CACHE_VERSION,
  VIEW_NETWORK_TIMEOUT_MS,
} from "./sw-strategy";

const ORIGIN = "https://loop-lore.example";

/** @param path - pathname starting with a slash */
function url(path: string,): URL {
  return new URL(`${ORIGIN}${path}`,);
}

describe("classifyRequest — static shell → cache-first", () => {
  test("layout css resolves to the shell class", () => {
    expect(classifyRequest(url("/css/app.css",), "GET", "no-cors", ORIGIN,),).toBe("shell",);
    expect(classifyRequest(url("/css/theme-default.css",), "GET", "no-cors", ORIGIN,),).toBe("shell",);
  });

  test("core js bundles and brand assets resolve to the shell class", () => {
    expect(classifyRequest(url("/alpine-init.js",), "GET", "no-cors", ORIGIN,),).toBe("shell",);
    expect(classifyRequest(url("/favicon.svg",), "GET", "no-cors", ORIGIN,),).toBe("shell",);
    expect(classifyRequest(url("/manifest.webmanifest",), "GET", "no-cors", ORIGIN,),).toBe("shell",);
    expect(classifyRequest(url("/offline.html",), "GET", "no-cors", ORIGIN,),).toBe("shell",);
  });

  test("runtime-cacheable asset prefixes (img/locales/components) resolve to shell", () => {
    expect(classifyRequest(url("/img/characters/default-avatar.svg",), "GET", "no-cors", ORIGIN,),).toBe("shell",);
    expect(classifyRequest(url("/locales/en.json",), "GET", "no-cors", ORIGIN,),).toBe("shell",);
  });

  test("asset prefixes with non-shell extensions pass through", () => {
    // e.g. a future binary blob under /img/ with an unmapped extension.
    expect(classifyRequest(url("/img/model.bin",), "GET", "no-cors", ORIGIN,),).toBe("passthrough",);
  });

  test("strategy is cache-first", () => {
    expect(strategyFor(classifyRequest(url("/css/app.css",), "GET", "no-cors", ORIGIN,),),).toBe("cache-first",);
  });
});

describe("classifyRequest — /views HTML → network-first with offline fallback", () => {
  test("view paths and top-level navigations resolve to the view class", () => {
    expect(classifyRequest(url("/views/chat-list",), "GET", "cors", ORIGIN,),).toBe("view",);
    expect(classifyRequest(url("/views/chats/abc/messages",), "GET", "cors", ORIGIN,),).toBe("view",);
    expect(classifyRequest(url("/",), "GET", "navigate", ORIGIN,),).toBe("view",);
    expect(classifyRequest(url("/views/settings",), "GET", "navigate", ORIGIN,),).toBe("view",);
  });

  test("strategy is network-first with offline-page fallback", () => {
    expect(strategyFor("view",),).toBe("network-first-offline-page",);
    expect(VIEW_NETWORK_TIMEOUT_MS,).toBeGreaterThan(0,);
  });
});

describe("classifyRequest — /api → network-only (never cached)", () => {
  test("api paths resolve to the api class regardless of mode", () => {
    expect(classifyRequest(url("/api/v1/chats",), "GET", "cors", ORIGIN,),).toBe("api",);
    expect(classifyRequest(url("/api/v1/chats/abc/messages",), "GET", "navigate", ORIGIN,),).toBe("api",);
  });

  test("api strategy is network-only (SW does not respondWith)", () => {
    expect(strategyFor("api",),).toBe("network-only",);
  });
});

describe("classifyRequest — never cache writes or foreign surfaces", () => {
  test("non-GET methods always pass through, even against shell and view paths", () => {
    expect(classifyRequest(url("/css/app.css",), "POST", "no-cors", ORIGIN,),).toBe("passthrough",);
    expect(classifyRequest(url("/views/chat-list",), "POST", "cors", ORIGIN,),).toBe("passthrough",);
    expect(classifyRequest(url("/api/v1/chats",), "DELETE", "cors", ORIGIN,),).toBe("passthrough",);
  });

  test("the service worker script itself passes through", () => {
    expect(classifyRequest(url("/sw.js",), "GET", "no-cors", ORIGIN,),).toBe("passthrough",);
  });

  test("cross-origin requests pass through when the SW origin is given", () => {
    const foreign = new URL("https://cdn.example/css/app.css",);
    expect(classifyRequest(foreign, "GET", "no-cors", ORIGIN,),).toBe("passthrough",);
  });

  test("top-level navigations get the view treatment even outside /views", () => {
    // Any top-level navigation is network-first with the offline-page fallback
    // and never cached — /docs and the /egui host page included.
    expect(classifyRequest(url("/docs/",), "GET", "navigate", ORIGIN,),).toBe("view",);
    expect(classifyRequest(url("/egui",), "GET", "navigate", ORIGIN,),).toBe("view",);
  });

  test("non-navigational requests to unclassified paths pass through", () => {
    expect(classifyRequest(url("/dynamic/worlds/list",), "GET", "cors", ORIGIN,),).toBe("passthrough",);
    expect(classifyRequest(url("/docs/assets/logo.png",), "GET", "no-cors", ORIGIN,),).toBe("passthrough",);
  });

  test("network-only is the strategy for everything the SW must not own", () => {
    expect(strategyFor("passthrough",),).toBe("network-only",);
  });
});

describe("precache manifest hygiene", () => {
  test("never lists api, views, or the service worker itself", () => {
    for (const entry of PRECACHE_URLS) {
      expect(entry.startsWith("/api/",),).toBe(false,);
      expect(entry.startsWith("/views",),).toBe(false,);
      expect(entry,).not.toBe("/sw.js",);
    }
  });

  test("every entry is a recognized shell asset path", () => {
    for (const entry of PRECACHE_URLS) {
      expect(isShellAssetPath(entry,),).toBe(true,);
    }
  });

  test("runtime cache prefixes exclude authenticated surfaces", () => {
    for (const prefix of RUNTIME_CACHE_PREFIXES) {
      expect(prefix.startsWith("/api",),).toBe(false,);
      expect(prefix.startsWith("/views",),).toBe(false,);
    }
  });

  test("cache name embeds the version constant for versioned purge", () => {
    expect(cacheName(),).toBe(`${CACHE_NAME_PREFIX}-${SW_CACHE_VERSION}`,);
    expect(SW_CACHE_VERSION,).toMatch(/^v\d+$/,);
  });
});

describe("hashed shell bundles", () => {
  test("hashed layout bundles classify as shell", () => {
    for (
      const path of [
        "/alpine-init-2gaz7rpx.js",
        "/chat-vendor-abc123.js",
        "/pages-def456.js",
        "/locale-init-a1b2c3d4.js",
      ]
    ) {
      expect(isShellAssetPath(path,),).toBe(true,);
      expect(classifyRequest(url(path,), "GET", "no-cors", ORIGIN,),).toBe("shell",);
    }
  });

  test("bare JS bundles are no longer precached", () => {
    for (const entry of ["/alpine-init.js", "/chat-vendor.js", "/pages.js", "/locale-init.js",]) {
      expect(PRECACHE_URLS,).not.toContain(entry,);
    }
  });
});

describe("offline fallback mode", () => {
  test("only top-level navigations receive offline.html", () => {
    expect(shouldServeOfflinePage("navigate",),).toBe(true,);
    expect(shouldServeOfflinePage("cors",),).toBe(false,);
    expect(shouldServeOfflinePage("same-origin",),).toBe(false,);
  });
});
