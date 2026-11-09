// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { exportChat, } from "./chat-export";

// ── Network + DOM stub ──────────────────────────────────────────────
// chat-export.ts imports `apiFetch` from ./htmx (a direct ESM binding), so
// overriding globalThis.apiFetch would NOT intercept it. The chain is
// apiFetch → feFetch → safeFetch → globalThis.fetch, so fetch is stubbed and
// the real request chain runs (same approach as chat-settings.test.ts).
// showToast (from ../ui) needs only document.querySelector("#toast-container")
// to resolve; it is null here so the error toast no-ops without a DOM.

const globals = globalThis as Record<string, unknown>;
const originalFetch = globalThis.fetch;
const originalDocument = globals.document;
const originalAlpine = globals.Alpine;
const originalCreateObjectURL = typeof URL !== "undefined" ? URL.createObjectURL : undefined;
const originalRevokeObjectURL = typeof URL !== "undefined" ? URL.revokeObjectURL : undefined;

let calls: string[] = [];
let failFetch = false;
let clickedHrefs: (string | null)[] = [];
let revoked: string[] = [];
let createdUrls: string[] = [];

beforeEach(() => {
  calls = [];
  failFetch = false;
  clickedHrefs = [];
  revoked = [];
  createdUrls = [];

  globalThis.fetch = (async (input: string | URL | Request,) => {
    const url = typeof input === "string" ? input : String(input,);
    calls.push(url,);
    if (failFetch) {
      return new Response("nope", { status: 500, },);
    }

    return new Response(new Blob(["# hi",], { type: "text/markdown", },), {
      status: 200,
      headers: { "Content-Disposition": 'attachment; filename="my-chat.md"', },
    },);
  }) as unknown as typeof fetch;

  // Alpine.$data scope with a selected chat; document only needs the toast
  // container query (null → showToast no-ops) plus createElement for the
  // download anchor.
  globals.Alpine = {
    $data: () => ({ currentChat: { id: "chat-1", name: "My Chat", }, }),
  };

  globals.document = {
    // Null for the toast container (showToast no-ops); a scope element for
    // the chat-state selector so chatStateData() resolves.
    querySelector: (selector: string,) => selector === "[x-data='chatState()']" ? {} : null,
    addEventListener: () => {},
    createElement: () => ({
      href: null as string | null,
      download: null as string | null,
      click(this: { href: string | null },) {
        clickedHrefs.push(this.href,);
      },
    }),
  };

  URL.createObjectURL = (() => {
    const url = `blob:mock-${createdUrls.length}`;
    createdUrls.push(url,);
    return url;
  }) as typeof URL.createObjectURL;

  URL.revokeObjectURL = ((url: string,) => {
    revoked.push(url,);
  }) as typeof URL.revokeObjectURL;
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
  globals.document = originalDocument;
  globals.Alpine = originalAlpine;
  if (originalCreateObjectURL !== undefined) {
    URL.createObjectURL = originalCreateObjectURL;
  }

  if (originalRevokeObjectURL !== undefined) {
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
},);

describe("exportChat", () => {
  test("fetches the export URL and triggers an anchored download", async () => {
    await exportChat("markdown",);
    expect(calls,).toEqual(["/api/v1/chats/chat-1/export?format=markdown",],);
    expect(clickedHrefs,).toEqual(createdUrls.slice(0, 1,),);
    expect(revoked,).toEqual(createdUrls,);
  });

  test("no-ops when no chat is selected", async () => {
    globals.Alpine = { $data: () => ({ currentChat: null, }), };
    await exportChat("json",);
    expect(calls,).toEqual([],);
    expect(clickedHrefs,).toEqual([],);
  });

  test("fetch failure surfaces no throw (toast path, no DOM container)", async () => {
    failFetch = true;
    await exportChat("markdown",);
    expect(calls,).toEqual(["/api/v1/chats/chat-1/export?format=markdown",],);
    // Nothing clicked: the error path returns before the anchor dance.
    expect(clickedHrefs,).toEqual([],);
  });
});
