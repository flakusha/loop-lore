// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavioral tests for the global asset preview module: it registers
 * `openAssetPreview` / `copyAssetUrl` / `downloadAsset` / `deleteAssetPreview`
 * on import. Tests drive those globals against a fake DOM and a `./fe-fetch`
 * module stub — Bun permanently binds bare `fetch`, so the module seam is the
 * only available hook.
 */
import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";

// Importing the module registers the asset-preview globals as a side effect.
import "./asset-preview";

let calls: { url: string; opts: RequestInit }[] = [];
let feHandler: ((url: string, opts: RequestInit,) => Response) | null = null;
mock.module("./fe-fetch", () => ({
  feFetch: async (url: string, opts: RequestInit = {},) => {
    calls.push({ url, opts, },);
    return feHandler ? feHandler(url, opts,) : new Response("{}", { status: 404, },);
  },
  getCsrfToken: () => "",
}),);

// ── Minimal fake DOM ────────────────────────────────────────

interface FakeEl {
  id: string;
  className: string;
  textContent: string;
  innerHTML: string;
  href: string;
  download: string;
  style: Record<string, string>;
  dataset: Record<string, string>;
  children: FakeEl[];
  parentNode: FakeEl | null;
  classList: { add(...n: string[]): void; remove(...n: string[]): void; contains(n: string,): boolean };
  setAttribute(name: string, value: string,): void;
  append(...els: FakeEl[]): void;
  remove(): void;
  click(): void;
  addEventListener(_t: string, _fn: unknown,): void;
  querySelector(sel: string,): FakeEl | null;
}

function makeEl(): FakeEl {
  const classes = new Set<string>();
  const children: FakeEl[] = [];
  const el: FakeEl = {
    id: "",
    className: "",
    textContent: "",
    innerHTML: "",
    href: "",
    download: "",
    style: {},
    dataset: {},
    children,
    parentNode: null,
    classList: {
      add: (...n) => {
        for (const x of n) { classes.add(x,); }
      },
      remove: (...n) => {
        for (const x of n) { classes.delete(x,); }
      },
      contains: (n,) => classes.has(n,),
    },
    setAttribute: (name, value,) => {
      if (name.startsWith("data-",)) {
        const camel = name.slice(5,).replace(/-([a-z])/g, (_, c: string,) => c.toUpperCase(),);
        el.dataset[camel] = value;
      }
    },
    append: (...added) => {
      for (const c of added) {
        c.parentNode = el;
        children.push(c,);
      }
    },
    remove: () => {
      const p = el.parentNode;
      if (p) { p.children.splice(p.children.indexOf(el,), 1,); }
      el.parentNode = null;
    },
    click: () => {},
    addEventListener: () => {},
    querySelector: (sel,) => findEl(children, sel,),
  };
  return el;
}

/** Depth-first `[data-name='value']` selector match over fake subtrees. */
function findEl(els: FakeEl[], sel: string,): FakeEl | null {
  const m = /^\[data-([a-z-]+)=["']([^"']+)["']\]$/.exec(sel.trim(),);
  if (!m) { return null; }
  const camel = m[1]!.replace(/-([a-z])/g, (_, c: string,) => c.toUpperCase(),);
  for (const el of els) {
    if (el.dataset[camel] === m[2]) { return el; }
    const hit = findEl(el.children, sel,);
    if (hit) { return hit; }
  }
  return null;
}

interface FakeDocument {
  body: FakeEl;
  register(el: FakeEl,): FakeEl;
  querySelector(sel: string,): FakeEl | null;
  createElement(tag: string,): FakeEl;
  addEventListener(_t: string, _fn: unknown,): void;
}

function makeDocument(): FakeDocument {
  const byId = new Map<string, FakeEl>();
  return {
    body: makeEl(),
    register: (el,) => {
      byId.set(el.id, el,);
      return el;
    },
    querySelector: (sel,) => sel.startsWith("#",) ? byId.get(sel.slice(1,),) ?? null : null,
    createElement: () => makeEl(),
    addEventListener: () => {},
  };
}

// ── Browser environment stubs (named hosts, saved/restored) ──

const docHost = globalThis as { document?: unknown };
const locationHost = globalThis as { location?: { origin: string } };
const navHost = globalThis as { navigator: { clipboard?: { writeText(text: string,): Promise<void> } } };
const previewHost = globalThis as unknown as {
  __previewAsset?: { id: string; filename?: string } | null;
  openAssetPreview?: (id: string,) => Promise<void>;
  copyAssetUrl?: () => Promise<void>;
  downloadAsset?: () => Promise<void>;
  deleteAssetPreview?: () => Promise<void>;
  confirm?: (message: string,) => boolean;
  htmx?: { trigger(el: unknown, evt: string,): void };
};
const originalDocument = docHost.document;
const originalNavigator = navHost.navigator;
const originalHtmx = previewHost.htmx;

let doc: FakeDocument;
let clipboardWrites: string[] = [];
let clipboardFails = false;
let confirmAnswer = true;
let htmxTriggers: string[] = [];

function jsonResponse(body: unknown, status = 200,): Response {
  return new Response(JSON.stringify(body,), { status, },);
}

/** Stub the API the way the server would: asset json + signed URLs + DELETE. */
function serveAsset(asset: Record<string, unknown>,): void {
  feHandler = (url, init,) => {
    if (url === `/api/assets/${asset.id as string}` && !init.method) { return jsonResponse(asset,); }
    if (url === `/api/assets/${asset.id as string}` && init.method === "DELETE") { return jsonResponse({},); }
    if (url.startsWith(`/api/assets/${asset.id as string}/signed-url/`,)) {
      return jsonResponse({ url: `/signed${url.split("signed-url",)[1]}`, },);
    }
    return jsonResponse({}, 404,);
  };
}

beforeEach(() => {
  doc = makeDocument();
  docHost.document = doc as unknown as Document;
  locationHost.location = { origin: "http://localhost:3000", };
  navHost.navigator = {
    clipboard: {
      writeText: async (text,) => {
        if (clipboardFails) { throw new Error("denied",); }
        clipboardWrites.push(text,);
      },
    },
  };
  previewHost.confirm = () => confirmAnswer;
  previewHost.htmx = {
    trigger: (_el, evt,) => {
      htmxTriggers.push(evt,);
    },
  };
  calls = [];
  feHandler = null;
  htmxTriggers = [];
  clipboardWrites = [];
  clipboardFails = false;
  confirmAnswer = true;
  previewHost.__previewAsset = null;
  doc.register(doc.body,);
  const modal = makeEl();
  modal.id = "preview-modal";
  for (const field of ["filename", "mime", "size", "preview-body",]) {
    const child = makeEl();
    child.setAttribute("data-field", field,);
    modal.append(child,);
  }
  doc.register(modal,); // modal already mounted in #modal-container
  for (const id of ["asset-grid", "toast-container",]) {
    const el = makeEl();
    el.id = id;
    doc.register(el,);
  }
},);

afterEach(() => {
  docHost.document = originalDocument;
  locationHost.location = undefined;
  navHost.navigator = originalNavigator;
  previewHost.confirm = undefined;
  previewHost.htmx = originalHtmx;
},);

const IMAGE = { id: "a1", filename: "cat.png", mime_type: "image/png", size_bytes: 2048, asset_type: "image", };

describe("openAssetPreview", () => {
  test("registers globals; fills the mounted modal; renders a signed image", async () => {
    expect(typeof previewHost.openAssetPreview,).toBe("function",);
    expect(typeof previewHost.copyAssetUrl,).toBe("function",);
    expect(typeof previewHost.downloadAsset,).toBe("function",);
    expect(typeof previewHost.deleteAssetPreview,).toBe("function",);
    serveAsset(IMAGE,);
    await previewHost.openAssetPreview!("a1",);
    expect(calls.map((c,) => c.url),).toEqual(["/api/assets/a1", "/api/assets/a1/signed-url/raw",],);
    const modal = doc.querySelector("#preview-modal",)!;
    expect(modal.classList.contains("open",),).toBe(true,);
    expect(modal.querySelector("[data-field='filename']",)!.textContent,).toBe("cat.png",);
    expect(modal.querySelector("[data-field='mime']",)!.textContent,).toBe("image/png",);
    expect(modal.querySelector("[data-field='size']",)!.textContent,).toBe("2.0 KB",);
    expect(modal.querySelector("[data-field='preview-body']",)!.innerHTML,)
      .toBe(`<img src="http://localhost:3000/signed/raw" alt="cat.png" style="width:100%;display:block" />`,);
    expect(previewHost.__previewAsset?.id,).toBe("a1",);
  });

  test("falls back to the relative raw URL when signing fails, escaping metadata", async () => {
    feHandler = (url, init,) => {
      if (url === "/api/assets/a1" && !init.method) { return jsonResponse({ ...IMAGE, filename: `&<>"'x`, },); }
      return jsonResponse({ url: 123, },); // non-string url → null → relative fallback
    };
    await previewHost.openAssetPreview!("a1",);
    const body = doc.querySelector("#preview-modal",)!.querySelector("[data-field='preview-body']",)!;
    expect(body.innerHTML,).toBe(
      `<img src="/api/assets/a1/raw" alt="&amp;&lt;&gt;&quot;&#39;x" style="width:100%;display:block" />`,
    );
  });

  test("renders audio, video, and generic files with distinct markup", async () => {
    serveAsset(IMAGE,);
    for (
      const [assetType, prefix,] of [
        ["audio", "<audio controls",],
        ["video", "<video controls",],
        ["model", `<div style="padding:var(--space-6);text-align:center">`,],
      ] as const
    ) {
      feHandler = (url,) =>
        url === "/api/assets/a1" ? jsonResponse({ ...IMAGE, asset_type: assetType, },) : jsonResponse({}, 404,);
      await previewHost.openAssetPreview!("a1",);
      const modal = doc.querySelector("#preview-modal",)!;
      expect(modal.querySelector("[data-field='preview-body']",)!.innerHTML.startsWith(prefix,),).toBe(true,);
      expect(modal.classList.contains("open",),).toBe(true,);
    }
  });

  test("formats sizes across unit boundaries", async () => {
    serveAsset(IMAGE,);
    const sizeEl = () => doc.querySelector("#preview-modal",)!.querySelector("[data-field='size']",)!.textContent;
    for (const [bytes, want,] of [[0, "0 B",], [512, "512 B",], [3_145_728, "3.0 MB",],] as const) {
      feHandler = (url,) =>
        url === "/api/assets/a1" ? jsonResponse({ ...IMAGE, size_bytes: bytes, },) : jsonResponse({}, 404,);
      await previewHost.openAssetPreview!("a1",);
      expect(sizeEl(),).toBe(want,);
    }
  });

  test("keeps prior state on lookup failure; swallows throws; bails without modal", async () => {
    serveAsset(IMAGE,);
    await previewHost.openAssetPreview!("a1",);
    expect(previewHost.__previewAsset?.id,).toBe("a1",);
    feHandler = () => jsonResponse({}, 404,);
    await previewHost.openAssetPreview!("missing",);
    expect(previewHost.__previewAsset?.id,).toBe("a1",); // unchanged
    feHandler = (url,) => {
      if (url.endsWith("/signed-url/raw",)) { throw new Error("net down",); } // signed → null
      return jsonResponse({}, 404,);
    };
    await previewHost.openAssetPreview!("a1",); // signing network failure → fallback
    feHandler = () => {
      throw new Error("offline",);
    };
    await expect(previewHost.openAssetPreview!("a1",),).resolves.toBeUndefined(); // swallowed
    doc = makeDocument(); // no #modal-container, no #preview-modal
    docHost.document = doc as unknown as Document;
    calls = [];
    await previewHost.openAssetPreview!("a1",);
    expect(previewHost.__previewAsset?.id,).toBe("a1",); // recorded before bailing
    expect(calls.map((c,) => c.url),).toEqual(["/api/assets/a1",],); // no modal fetch
  });
});

describe("copyAssetUrl", () => {
  test("copies origin-prefixed signed URL; no-ops without asset; errors on failure", async () => {
    await previewHost.copyAssetUrl!();
    expect(clipboardWrites,).toEqual([],); // no asset recorded yet
    serveAsset(IMAGE,);
    await previewHost.openAssetPreview!("a1",);
    await previewHost.copyAssetUrl!();
    expect(clipboardWrites,).toEqual(["http://localhost:3000/signed/raw",],);
    expect(doc.querySelector("#toast-container",)!.children[0]!.className,).toBe("toast success",);
    clipboardFails = true;
    await previewHost.copyAssetUrl!();
    expect(doc.querySelector("#toast-container",)!.children[1]!.className,).toBe("toast error",);
  });
});

describe("downloadAsset", () => {
  test("clicks a detached anchor; signed URL preferred, endpoint fallback", async () => {
    serveAsset(IMAGE,);
    await previewHost.openAssetPreview!("a1",);
    const anchors: FakeEl[] = [];
    const append = doc.body.append.bind(doc.body,);
    doc.body.append = (...els: FakeEl[]) => {
      anchors.push(...els,);
      append(...els,);
    };
    await previewHost.downloadAsset!();
    expect(anchors[0]!.href,).toBe("http://localhost:3000/signed/download",);
    expect(anchors[0]!.download,).toBe("cat.png",);
    expect(doc.body.children.length,).toBe(0,); // anchor removed after click
    previewHost.__previewAsset = { id: "a2", };
    feHandler = (url,) => url.endsWith("/signed-url/download",) ? jsonResponse({}, 500,) : jsonResponse({}, 404,);
    await previewHost.downloadAsset!(); // fallback path; name defaults to "asset"
    expect(anchors[1]!.download,).toBe("asset",);
    expect(anchors[1]!.href,).toBe("/api/assets/a2/download",);
    previewHost.__previewAsset = { id: "a3", filename: "x.bin", };
    doc.body.append = () => {
      throw new Error("no dom",); // download failure → module catch → toast
    };
    feHandler = () => jsonResponse({ url: "/signed/dl", },);
    await previewHost.downloadAsset!();
    expect(doc.querySelector("#toast-container",)!.children[0]!.className,).toBe("toast error",);
  });
});

describe("deleteAssetPreview", () => {
  test("deletes after confirm and closes the modal; guards and errors otherwise", async () => {
    await previewHost.deleteAssetPreview!();
    expect(calls,).toEqual([],); // no asset → nothing sent
    serveAsset(IMAGE,);
    await previewHost.openAssetPreview!("a1",);
    const afterOpen = calls.length;
    confirmAnswer = false;
    await previewHost.deleteAssetPreview!();
    expect(calls.length,).toBe(afterOpen,); // declined confirm → no DELETE sent
    confirmAnswer = true;
    feHandler = () => {
      throw new Error("offline",); // network failure → module catch → toast
    };
    await previewHost.deleteAssetPreview!();
    expect(doc.querySelector("#preview-modal",)!.classList.contains("open",),).toBe(true,);
    expect(doc.querySelector("#toast-container",)!.children[0]!.className,).toBe("toast error",);
    feHandler = null;
    serveAsset(IMAGE,);
    await previewHost.deleteAssetPreview!();
    expect(calls.at(-1,)?.opts.method,).toBe("DELETE",);
    expect(doc.querySelector("#preview-modal",)!.classList.contains("open",),).toBe(false,);
    expect(previewHost.__previewAsset,).toBeNull();
    expect(htmxTriggers,).toEqual(["load",],);
  });
});
