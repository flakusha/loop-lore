// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { worldInvites, } from "./world-invites";
import type { WorldEditState, } from "./world-types";

// Bare-global apiFetch/showToast/confirm pattern (mirrors world-items.test.ts).
const g = globalThis as unknown as {
  apiFetch?: (url: string | URL, opts?: RequestInit,) => Promise<Response>;
  showToast?: (...args: unknown[]) => void;
};
const originalApiFetch = g.apiFetch;
const originalShowToast = g.showToast;
const originalConfirm = globalThis.confirm;

let fetchCalls: { url: string; opts?: RequestInit }[] = [];
let fetchHandler: ((url: string, opts?: RequestInit,) => Response) | null = null;
let toasts: { type: string; message: string }[] = [];

function ctx(overrides?: Partial<WorldEditState>,): WorldEditState {
  return {
    ...(worldInvites as unknown as WorldEditState),
    worldId: "w1",
    ...overrides,
  } as WorldEditState;
}

function mockFetch(status: number, body: unknown = {},): void {
  fetchHandler = () => Response.json(body, { status, },);
}

beforeEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  toasts = [];
  g.apiFetch = async (url: string | URL, opts?: RequestInit,) => {
    fetchCalls.push({ url: String(url,), opts, },);
    if (!fetchHandler) { return new Response("{}", { status: 500, },); }
    return fetchHandler(String(url,), opts ?? {},);
  };
  g.showToast = (type, message,) => {
    toasts.push({ type: type as string, message: message as string, },);
  };
  globalThis.confirm = () => true;
},);

afterEach(() => {
  fetchHandler = null;
  g.apiFetch = originalApiFetch;
  g.showToast = originalShowToast;
  globalThis.confirm = originalConfirm;
},);

describe("worldInvites.loadInvites", () => {
  test("returns early without a world id", async () => {
    const c = ctx({ worldId: null, },);
    await c.loadInvites();
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("stores rows and marks loaded", async () => {
    mockFetch(200, { data: [{ id: "i1", code: "ABC", },], },);
    const c = ctx();
    await c.loadInvites();
    expect(c.invites,).toHaveLength(1,);
    expect(c.invitesLoaded,).toBe(true,);
    expect(c.loadingInvites,).toBe(false,);
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/invites",);
  });

  test("keeps stale rows on failure", async () => {
    mockFetch(500, {},);
    const c = ctx();
    await c.loadInvites();
    expect(c.invites,).toEqual([],);
    expect(c.invitesLoaded,).toBe(false,);
    expect(c.loadingInvites,).toBe(false,);
  });

  test("tolerates missing data field", async () => {
    mockFetch(200, {},);
    const c = ctx();
    await c.loadInvites();
    expect(c.invites,).toEqual([],);
    expect(c.invitesLoaded,).toBe(true,);
  });
});

describe("worldInvites.createInvite", () => {
  test("returns early without a world id", async () => {
    const c = ctx({ worldId: null, newInviteMaxUses: "3", },);
    await c.createInvite();
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("rejects non-positive and fractional max uses", async () => {
    for (const bad of ["0", "-2", "1.5", "abc",]) {
      fetchCalls = [];
      toasts = [];
      const c = ctx({ newInviteMaxUses: bad, },);
      await c.createInvite();
      expect(fetchCalls,).toHaveLength(0,);
      expect(toasts[0]?.type,).toBe("error",);
    }
  });

  test("creates with null maxUses when the field is blank", async () => {
    mockFetch(201, { id: "i1", code: "XYZ", },);
    const c = ctx({
      newInviteMaxUses: "   ",
      invites: [],
      showInviteForm: true,
      copyInviteCode: async () => {},
    },);
    await c.createInvite();
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toEqual({ maxUses: null, },);
    expect(c.invites,).toHaveLength(1,);
    expect(c.newInviteMaxUses,).toBe("",);
    expect(c.showInviteForm,).toBe(false,);
    expect(toasts[0]?.type,).toBe("success",);
  });

  test("creates with an integer cap and unicode-safe code", async () => {
    mockFetch(201, { id: "i2", code: "招待-12", },);
    const c = ctx({
      newInviteMaxUses: "5",
      invites: [{ id: "i1", code: "OLD", },] as never,
      copyInviteCode: async () => {},
    },);
    await c.createInvite();
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toEqual({ maxUses: 5, },);
    expect(c.invites[0],).toMatchObject({ code: "招待-12", },);
    expect(c.invites,).toHaveLength(2,);
  });

  test("surfaces server errors", async () => {
    mockFetch(400, { error: "bad", },);
    const c = ctx({ newInviteMaxUses: "", invites: [], },);
    await c.createInvite();
    expect(c.invites,).toHaveLength(0,);
    expect(toasts[0]?.type,).toBe("error",);
  });
});

describe("worldInvites.copyInviteCode", () => {
  test("returns early when the clipboard is unavailable", async () => {
    const nav = globalThis.navigator as unknown as { clipboard?: unknown } | undefined;
    const hadClipboard = nav?.clipboard;
    if (nav) {
      try {
        (nav as Record<string, unknown>).clipboard = undefined;
      } catch {
        /* read-only navigator — early-return path still holds */
      }
    }
    const c = ctx();
    await expect(c.copyInviteCode("ABC",),).resolves.toBeUndefined();
    if (nav && hadClipboard !== undefined) {
      try {
        (nav as Record<string, unknown>).clipboard = hadClipboard;
      } catch {
        /* ignore */
      }
    }
  });

  test("writes the code when a clipboard is present", async () => {
    const written: string[] = [];
    const nav = globalThis.navigator as unknown as Record<string, unknown> | undefined;
    if (!nav) {
      return;
    }
    const prev = nav.clipboard;
    try {
      nav.clipboard = {
        writeText: async (s: string,) => {
          written.push(s,);
        },
      };
    } catch {
      return;
    }
    const c = ctx();
    await c.copyInviteCode("HELLO",);
    expect(written,).toEqual(["HELLO",],);
    try {
      nav.clipboard = prev;
    } catch {
      /* ignore */
    }
  });

  test("swallows clipboard write failures", async () => {
    const nav = globalThis.navigator as unknown as Record<string, unknown> | undefined;
    if (!nav) {
      return;
    }
    const prev = nav.clipboard;
    try {
      nav.clipboard = {
        writeText: async () => {
          throw new Error("denied",);
        },
      };
    } catch {
      return;
    }
    const c = ctx();
    await expect(c.copyInviteCode("ABC",),).resolves.toBeUndefined();
    try {
      nav.clipboard = prev;
    } catch {
      /* ignore */
    }
  });
});

describe("worldInvites.revokeInvite", () => {
  test("returns early without a world id or for unknown ids", async () => {
    const noWorld = ctx({ worldId: null, invites: [{ id: "i1", code: "A", },] as never, },);
    await noWorld.revokeInvite("i1",);
    const unknown = ctx({ invites: [], },);
    await unknown.revokeInvite("missing",);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("DELETEs and removes the row", async () => {
    mockFetch(200, {},);
    const c = ctx({ invites: [{ id: "i1", code: "A", }, { id: "i2", code: "B", },] as never, },);
    await c.revokeInvite("i1",);
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/invites/i1",);
    expect(c.invites.map((r,) => r.id),).toEqual(["i2",],);
    expect(toasts[0]?.type,).toBe("success",);
  });

  test("aborts when confirm is declined", async () => {
    globalThis.confirm = () => false;
    const c = ctx({ invites: [{ id: "i1", code: "A", },] as never, },);
    await c.revokeInvite("i1",);
    expect(fetchCalls,).toHaveLength(0,);
    expect(c.invites,).toHaveLength(1,);
  });

  test("surfaces server errors", async () => {
    mockFetch(400, { error: "gone", },);
    const c = ctx({ invites: [{ id: "i1", code: "A", },] as never, },);
    await c.revokeInvite("i1",);
    expect(c.invites,).toHaveLength(1,);
    expect(toasts[0]?.type,).toBe("error",);
  });
});
