// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavioral tests for the character edit form page logic.
 *
 * Covers the new appearance + defaultOutfit fields: the save payload mirrors
 * every edit-* input into the PUT body, and avatar upload/clear wire the
 * hidden input + preview + toast calls.
 *
 * `./fe-fetch` is the module seam (mocked — no network); the DOM and sibling
 * page modules (`./shared`, `../ui`) are stubbed on globalThis with
 * listener-stashing fakes.
 */
import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";

let fetchCalls: { url: string; opts?: RequestInit }[] = [];
let feHandler: ((url: string, opts?: RequestInit,) => Response | Promise<Response>) | null = null;

mock.module("../fe-fetch", () => ({
  feFetch: async (url: string, opts: RequestInit = {},) => {
    fetchCalls.push({ url, opts, },);
    if (!feHandler) { return new Response("{}", { status: 404, },); }
    return feHandler(url, opts,);
  },
  getCsrfToken: () => "",
}),);

mock.module("../ui", () => ({
  showToast: (type: string, message: string,) => {
    toastCalls.push({ type, message, },);
  },
}),);

mock.module("./shared", () => ({
  escapeHtml: (s: string,) =>
    s.replace(/[&<>"']/g, (c,) => {
      switch (c) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#39;";
      }
    },),
}),);

let toastCalls: { type: string; message: string }[] = [];

// ── fake DOM ────────────────────────────────────────────────

interface FakeEl {
  value: string;
  innerHTML: string;
  textContent: string;
}

function makeEl(value = "",): FakeEl {
  return { value, innerHTML: "", textContent: "", };
}

const host = globalThis as unknown as {
  document?: unknown;
  location?: unknown;
};

const originalDocument = host.document;
const originalLocation = host.location;
let els: Map<string, FakeEl>;
let assignedUrls: string[];

const page = globalThis as unknown as {
  saveCharacterEdit: (characterId: string,) => Promise<void>;
  uploadAvatar: (input: HTMLInputElement,) => Promise<void>;
  clearAvatar: () => void;
};

beforeEach(() => {
  fetchCalls = [];
  toastCalls = [];
  feHandler = null;
  els = new Map();
  assignedUrls = [];
  host.document = {
    querySelector: (sel: string,) => (sel.startsWith("#",) ? els.get(sel.slice(1,),) ?? null : null),
    createElement: () => makeEl(),
  } as unknown as Document;
  host.location = {
    assign: (url: string,) => {
      assignedUrls.push(url,);
    },
  };
},);

afterEach(() => {
  host.document = originalDocument;
  host.location = originalLocation;
},);

function seedForm(values: Record<string, string>,): void {
  for (const [id, value,] of Object.entries(values,)) {
    els.set(id, makeEl(value,),);
  }
  els.set("avatar-preview", makeEl(),);
}

describe("saveCharacterEdit", () => {
  test("mirrors appearance + defaultOutfit into the PUT body on success", async () => {
    await import("./characters-edit-form");
    seedForm({
      "edit-name": "Aria",
      "edit-desc": "A singer",
      "edit-system": "You are Aria.",
      "edit-personality": "warm",
      "edit-appearance": "Tall with silver hair",
      "edit-outfit": "travel-gear",
      "edit-greeting": "Hello!",
      "edit-scenario": "At the tavern",
      "edit-example": "<user>hi</user>",
      "edit-post-history": "keep it short",
      "char-avatar-id": "av1",
      "char-data-version": "7",
      "edit-avatar-focus-x": "25",
      "edit-avatar-focus-y": "80",
      "edit-content-rating": "nsfw_moderate",
    },);
    feHandler = () => new Response("{}", { status: 200, },);

    await page.saveCharacterEdit("actor-aria",);

    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]!.url,).toBe("/api/actors/actor-aria",);
    const body = JSON.parse(fetchCalls[0]!.opts!.body as string,) as Record<string, unknown>;
    expect(body["appearance"],).toBe("Tall with silver hair",);
    expect(body["defaultOutfit"],).toBe("travel-gear",);
    expect(body["displayName"],).toBe("Aria",);
    // CHAR-1: the loaded version must ride along with every save.
    expect(body["dataVersion"],).toBe(7,);
    expect(body["avatarFocusX"],).toBe(25,);
    expect(body["avatarFocusY"],).toBe(80,);
    expect(toastCalls,).toEqual([{ type: "success", message: "Character saved", },],);
    expect(assignedUrls,).toEqual(["/views/characters",],);
  });

  test("omits defaultOutfit when the outfit input is blank", async () => {
    await import("./characters-edit-form");
    seedForm({ "edit-name": "Aria", "edit-outfit": "", },);
    feHandler = () => new Response("{}", { status: 200, },);

    await page.saveCharacterEdit("actor-aria",);

    const body = JSON.parse(fetchCalls[0]!.opts!.body as string,) as Record<string, unknown>;
    expect("defaultOutfit" in body,).toBe(false,);
    expect(body["appearance"],).toBe("",);
  });

  test("shows the server error message when the PUT fails", async () => {
    await import("./characters-edit-form");
    seedForm({ "edit-name": "Aria", },);
    feHandler = () => new Response(JSON.stringify({ message: "Duplicate outfit id", },), { status: 400, },);

    await page.saveCharacterEdit("actor-aria",);

    expect(toastCalls,).toEqual([{ type: "error", message: "Duplicate outfit id", },],);
    expect(assignedUrls,).toEqual([],);
  });

  test("shows the fallback message when the PUT throws", async () => {
    await import("./characters-edit-form");
    seedForm({ "edit-name": "Aria", },);
    feHandler = () => {
      throw new Error("boom",);
    };

    await page.saveCharacterEdit("actor-aria",);

    expect(toastCalls,).toEqual([{ type: "error", message: "Failed to save character", },],);
  });
});

describe("uploadAvatar / clearAvatar", () => {
  test("uploadAvatar stores the asset id and renders the preview", async () => {
    await import("./characters-edit-form");
    seedForm({ "char-avatar-id": "", },);
    feHandler = (url,) => {
      expect(url,).toBe("/api/assets",);
      return new Response(JSON.stringify({ id: "av2<script>", },), { status: 200, },);
    };
    const file = new File(["x",], "avatar.png", { type: "image/png", },);
    const input = { files: [file,], } as unknown as HTMLInputElement;

    await page.uploadAvatar(input,);

    expect(els.get("char-avatar-id",)!.value,).toBe("av2<script>",);
    // Hostile id must be escaped, never interpolated raw.
    expect(els.get("avatar-preview",)!.innerHTML,).toContain("av2&lt;script&gt;",);
    expect(els.get("avatar-preview",)!.innerHTML,).not.toContain("<script>",);
    expect(toastCalls,).toEqual([{ type: "success", message: "Avatar uploaded — save to apply", },],);
  });

  test("uploadAvatar toasts and keeps state on failure", async () => {
    await import("./characters-edit-form");
    seedForm({ "char-avatar-id": "av1", },);
    feHandler = () => new Response("{}", { status: 500, },);
    const file = new File(["x",], "avatar.png", { type: "image/png", },);

    await page.uploadAvatar({ files: [file,], } as unknown as HTMLInputElement,);

    expect(els.get("char-avatar-id",)!.value,).toBe("av1",);
    expect(toastCalls,).toEqual([{ type: "error", message: "Avatar upload failed", },],);
  });

  test("uploadAvatar is a no-op without a file", async () => {
    await import("./characters-edit-form");
    seedForm({},);

    await page.uploadAvatar({} as HTMLInputElement,);

    expect(fetchCalls.length,).toBe(0,);
    expect(toastCalls,).toEqual([],);
  });

  test("clearAvatar resets the hidden input and preview", async () => {
    await import("./characters-edit-form");
    seedForm({ "char-avatar-id": "av1", },);

    page.clearAvatar();

    expect(els.get("char-avatar-id",)!.value,).toBe("",);
    expect(els.get("avatar-preview",)!.innerHTML,).toBe("<span>👤</span>",);
    expect(toastCalls,).toEqual([{ type: "info", message: "Avatar cleared — save to apply", },],);
  });
});
