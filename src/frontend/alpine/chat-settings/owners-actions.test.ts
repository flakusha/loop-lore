// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `ownersActions` (Alpine actions mixed into the chat settings modal).
 *
 * Mirrors `ownership-actions.test.ts` — mocks `apiFetch`, builds a minimal ctx,
 * invokes the action methods, asserts on state transitions + API call shape.
 *
 * Pins the contract:
 *   - loadChatOwners: GETs `/api/v1/chats/:id/owners`, adopts `owners`
 *   - submitAddOwner: POSTs `/api/v1/chats/:id/owners` { actorId, reason? };
 *     on success adopts returned owners + reloads participants; on error
 *     surfaces the server envelope message
 *   - submitRemoveOwner: DELETEs `/api/v1/chats/:id/owners/:userId?reason=`;
 *     resign is just removal of self
 *   - ownerCapReached / ownerName / addableParticipants helpers
 */
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { OWNER_CAP, ownersActions, } from "./owners";

let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

function mockFetch(status: number, body: unknown = {},): void {
  fetchHandler = () => Response.json(body, { status, },);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

function ownersCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    activeChat: "chat-1",
    _owners: ["user-1",] as string[],
    _ownersLoading: false,
    _ownersError: "" as string,
    _addOwnerModalOpen: false,
    _addOwnerId: "",
    _addOwnerReason: "",
    _addOwnerSubmitting: false,
    _addOwnerError: "" as string,
    _removeOwnerModalOpen: false,
    _removeOwnerId: "",
    _removeOwnerReason: "",
    _removeOwnerSubmitting: false,
    _removeOwnerError: "" as string,
    _removeOwnerResign: false,
    _chatParticipants: [] as { actor_id: string; name: string; display_name?: string }[],
    loadChatParticipants: async () => {},
    ...overrides,
  };
}

describeOrSkip("ownersActions.loadChatOwners", () => {
  test("GETs the owners list and adopts the payload", async () => {
    mockFetch(200, { chatId: "chat-1", owners: ["user-1", "user-2",], },);
    const ctx = ownersCtx({ _owners: [], },);

    await ownersActions.loadChatOwners!.call(ctx,);

    expect(fetchCalls,).toHaveLength(1,);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/chat-1/owners",);
    expect(ctx._owners,).toEqual(["user-1", "user-2",],);
    expect(ctx._ownersError,).toBe("",);
    expect(ctx._ownersLoading,).toBe(false,);
  });

  test("no-ops without activeChat", async () => {
    const ctx = ownersCtx({ activeChat: null, },);
    await ownersActions.loadChatOwners!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("surfaces HTTP status when the response is non-ok", async () => {
    mockFetch(404, { error: "Chat not found", },);
    const ctx = ownersCtx({ _owners: ["stale",], },);

    await ownersActions.loadChatOwners!.call(ctx,);
    expect(ctx._owners,).toEqual([],);
    expect(ctx._ownersError,).toBe("HTTP 404",);
  });

  test("catches network errors and surfaces them", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };

    const ctx = ownersCtx({ _owners: ["stale",], },);

    await ownersActions.loadChatOwners!.call(ctx,);
    expect(ctx._ownersError,).toBe("offline",);
    expect(ctx._ownersLoading,).toBe(false,);
  });
},);

describeOrSkip("ownersActions.ownerCapReached", () => {
  test("OWNER_CAP mirrors the server 3-owner ceiling", () => {
    expect(OWNER_CAP,).toBe(3,);
  });

  test("false below the cap", () => {
    const ctx = ownersCtx({ _owners: ["a", "b",], },);
    expect(ownersActions.ownerCapReached!.call(ctx,),).toBe(false,);
  });

  test("true at the cap of 3", () => {
    const ctx = ownersCtx({ _owners: ["a", "b", "c",], },);
    expect(ownersActions.ownerCapReached!.call(ctx,),).toBe(true,);
  });
},);

describeOrSkip("ownersActions.ownerName", () => {
  test("resolves display_name, then name, then the raw id", () => {
    const ctx = ownersCtx({
      _chatParticipants: [
        { actor_id: "u1", name: "U One", display_name: "Uno", },
        { actor_id: "u2", name: "Deux", },
      ],
    },);

    expect(ownersActions.ownerName!.call(ctx, "u1",),).toBe("Uno",);
    expect(ownersActions.ownerName!.call(ctx, "u2",),).toBe("Deux",);
    expect(ownersActions.ownerName!.call(ctx, "u3",),).toBe("u3",);
  });
},);

describeOrSkip("ownersActions.addableParticipants", () => {
  test("excludes existing owners", () => {
    const ctx = ownersCtx({
      _owners: ["u1",],
      _chatParticipants: [
        { actor_id: "u1", name: "One", },
        { actor_id: "u2", name: "Two", },
      ],
    },);

    expect(ownersActions.addableParticipants!.call(ctx,),).toEqual([
      { actor_id: "u2", name: "Two", },
    ],);
  });
},);

describeOrSkip("ownersActions.add-owner modal", () => {
  test("open resets fields; no-op without activeChat", () => {
    const ctx = ownersCtx({
      _addOwnerError: "stale",
      _addOwnerId: "old",
      _addOwnerReason: "stale reason",
    },);

    ownersActions.openAddOwnerModal!.call(ctx,);
    expect(ctx._addOwnerModalOpen,).toBe(true,);
    expect(ctx._addOwnerError,).toBe("",);
    expect(ctx._addOwnerId,).toBe("",);
    expect(ctx._addOwnerReason,).toBe("",);

    const noChat = ownersCtx({ activeChat: null, },);
    ownersActions.openAddOwnerModal!.call(noChat,);
    expect(noChat._addOwnerModalOpen,).toBe(false,);
  });

  test("close clears state", () => {
    const ctx = ownersCtx({ _addOwnerModalOpen: true, _addOwnerSubmitting: true, _addOwnerError: "oops", },);
    ownersActions.closeAddOwnerModal!.call(ctx,);
    expect(ctx._addOwnerModalOpen,).toBe(false,);
    expect(ctx._addOwnerSubmitting,).toBe(false,);
    expect(ctx._addOwnerError,).toBe("",);
  });
},);

describeOrSkip("ownersActions.submitAddOwner", () => {
  test("no-ops without activeChat", async () => {
    const ctx = ownersCtx({ activeChat: null, _addOwnerId: "u2", },);
    await ownersActions.submitAddOwner!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
    expect(ctx._addOwnerSubmitting,).toBe(false,);
  });

  test("surfaces validation error when no participant selected", async () => {
    const ctx = ownersCtx({ _addOwnerId: "", },);
    await ownersActions.submitAddOwner!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
    expect(ctx._addOwnerError,).toBe("chat.owners.selectParticipant",);
  });

  test("POSTs actorId+reason and adopts returned owners + reloads participants", async () => {
    mockFetch(200, { ok: true, chatId: "chat-1", userId: "u2", autoInvited: true, owners: ["u1", "u2",], },);
    let reloaded = 0;
    const ctx = ownersCtx({
      _addOwnerId: "u2",
      _addOwnerReason: "helping moderate",
      loadChatParticipants: async () => {
        reloaded++;
      },
    },);

    await ownersActions.submitAddOwner!.call(ctx,);

    expect(fetchCalls,).toHaveLength(1,);
    const call = fetchCalls[0]!;
    expect(call.url,).toBe("/api/v1/chats/chat-1/owners",);
    expect(call.opts.method,).toBe("POST",);
    expect(JSON.parse(call.opts.body as string,),).toEqual({ actorId: "u2", reason: "helping moderate", },);

    expect(ctx._owners,).toEqual(["u1", "u2",],);
    expect(ctx._addOwnerModalOpen,).toBe(false,);
    expect(ctx._addOwnerSubmitting,).toBe(false,);
    expect(ctx._addOwnerError,).toBe("",);
    expect(reloaded,).toBe(1,);
  });

  test("omits reason when blank", async () => {
    mockFetch(200, { ok: true, userId: "u2", owners: ["u1", "u2",], },);
    const ctx = ownersCtx({ _addOwnerId: "u2", _addOwnerReason: "   ", },);

    await ownersActions.submitAddOwner!.call(ctx,);
    expect(JSON.parse(fetchCalls[0]!.opts.body as string,),).toEqual({ actorId: "u2", },);
  });

  test("surfaces 403 server error message", async () => {
    mockFetch(403, { error: "Only an owner may grant co-ownership", code: "FORBIDDEN", meta: { api_version: "1", }, },);
    const ctx = ownersCtx({ _addOwnerId: "u2", },);

    await ownersActions.submitAddOwner!.call(ctx,);
    expect(ctx._addOwnerError,).toBe("Only an owner may grant co-ownership",);
    expect(ctx._addOwnerModalOpen,).toBe(false,);
    expect(ctx._addOwnerSubmitting,).toBe(false,);
  });

  test("surfaces 400 duplicate/cap errors", async () => {
    mockFetch(400, { error: "already an owner", code: "DUPLICATE_OWNER", meta: { api_version: "1", }, },);
    const ctx = ownersCtx({ _addOwnerId: "u2", },);

    await ownersActions.submitAddOwner!.call(ctx,);
    expect(ctx._addOwnerError,).toBe("already an owner",);
  });

  test("falls back to HTTP status when the error body is non-JSON", async () => {
    fetchHandler = () => new Response("plain text", { status: 500, },);
    const ctx = ownersCtx({ _addOwnerId: "u2", },);

    await ownersActions.submitAddOwner!.call(ctx,);
    expect(ctx._addOwnerError,).toBe("HTTP 500",);
  });

  test("catches network errors and surfaces them", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };

    const ctx = ownersCtx({ _addOwnerId: "u2", },);

    await ownersActions.submitAddOwner!.call(ctx,);
    expect(ctx._addOwnerError,).toBe("offline",);
    expect(ctx._addOwnerSubmitting,).toBe(false,);
  });
},);

describeOrSkip("ownersActions.remove-owner modal", () => {
  test("open detects resign vs removal and resets fields", () => {
    const originalUserId = globalThis.__USER_ID;
    try {
      globalThis.__USER_ID = "user-1";
      const ctx = ownersCtx({ _removeOwnerError: "stale", _removeOwnerReason: "stale", },);

      ownersActions.openRemoveOwnerModal!.call(ctx, "user-1",);
      expect(ctx._removeOwnerResign,).toBe(true,);
      expect(ctx._removeOwnerModalOpen,).toBe(true,);
      expect(ctx._removeOwnerId,).toBe("user-1",);
      expect(ctx._removeOwnerReason,).toBe("",);
      expect(ctx._removeOwnerError,).toBe("",);

      ownersActions.openRemoveOwnerModal!.call(ctx, "user-2",);
      expect(ctx._removeOwnerResign,).toBe(false,);
    } finally {
      globalThis.__USER_ID = originalUserId;
    }
  });

  test("close clears state", () => {
    const ctx = ownersCtx({ _removeOwnerModalOpen: true, _removeOwnerSubmitting: true, _removeOwnerError: "oops", },);
    ownersActions.closeRemoveOwnerModal!.call(ctx,);
    expect(ctx._removeOwnerModalOpen,).toBe(false,);
    expect(ctx._removeOwnerSubmitting,).toBe(false,);
    expect(ctx._removeOwnerError,).toBe("",);
  });
},);

describeOrSkip("ownersActions.submitRemoveOwner", () => {
  test("no-ops without a pending owner id", async () => {
    const ctx = ownersCtx({ _removeOwnerId: "", },);
    await ownersActions.submitRemoveOwner!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("DELETEs the owner with encoded reason and adopts returned owners", async () => {
    mockFetch(200, { ok: true, chatId: "chat-1", userId: "u2", owners: ["u1",], },);
    let reloaded = 0;
    const ctx = ownersCtx({
      _removeOwnerId: "u2",
      _removeOwnerReason: "left the project",
      loadChatParticipants: async () => {
        reloaded++;
      },
    },);

    await ownersActions.submitRemoveOwner!.call(ctx,);

    expect(fetchCalls,).toHaveLength(1,);
    const call = fetchCalls[0]!;
    expect(call.url,).toBe("/api/v1/chats/chat-1/owners/u2?reason=left%20the%20project",);
    expect(call.opts.method,).toBe("DELETE",);

    expect(ctx._owners,).toEqual(["u1",],);
    expect(ctx._removeOwnerModalOpen,).toBe(false,);
    expect(ctx._removeOwnerSubmitting,).toBe(false,);
    expect(reloaded,).toBe(1,);
  });

  test("omits the query string when no reason is given", async () => {
    mockFetch(200, { ok: true, userId: "u2", owners: ["u1",], },);
    const ctx = ownersCtx({ _removeOwnerId: "u2", _removeOwnerReason: "  ", },);

    await ownersActions.submitRemoveOwner!.call(ctx,);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/chats/chat-1/owners/u2",);
  });

  test("surfaces 403 server error message", async () => {
    mockFetch(403, { error: "Only an owner may remove owners", code: "FORBIDDEN", meta: { api_version: "1", }, },);
    const ctx = ownersCtx({ _removeOwnerId: "u2", },);

    await ownersActions.submitRemoveOwner!.call(ctx,);
    expect(ctx._removeOwnerError,).toBe("Only an owner may remove owners",);
    expect(ctx._removeOwnerModalOpen,).toBe(false,);
  });

  test("surfaces 400 last-owner guard errors", async () => {
    mockFetch(400, { error: "cannot remove the last owner", code: "LAST_OWNER", meta: { api_version: "1", }, },);
    const ctx = ownersCtx({ _removeOwnerId: "u1", },);

    await ownersActions.submitRemoveOwner!.call(ctx,);
    expect(ctx._removeOwnerError,).toBe("cannot remove the last owner",);
  });

  test("catches network errors and surfaces them", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };

    const ctx = ownersCtx({ _removeOwnerId: "u2", },);

    await ownersActions.submitRemoveOwner!.call(ctx,);
    expect(ctx._removeOwnerError,).toBe("offline",);
    expect(ctx._removeOwnerSubmitting,).toBe(false,);
  });
},);
