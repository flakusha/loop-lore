// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `ownershipActions` (Alpine actions mixed into the chat settings modal).
 *
 * Mirrors `persona-actions.test.ts` — mocks `apiFetch`, builds a minimal ctx,
 * invokes the action methods, asserts on state transitions + API call shape.
 *
 * Pins the contract:
 *   - openOwnershipTransferModal: opens modal, resets fields, no-op without activeChat
 *   - closeOwnershipTransferModal: clears state
 *   - submitOwnershipTransfer: POSTs `/api/v1/chats/:id/transfer-ownership`; on
 *     success: closes modal + reloads participants; on error: surfaces message
 *   - canTransferOwnership: predicate
 */
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { ownershipActions, } from "./ownership";

let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("../htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

function mockFetch(status: number, body: unknown = {},): void {
  fetchHandler = () => Response.json(body, { status, },);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

function ownershipCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    activeChat: "chat-1",
    _ownershipModalOpen: false,
    _ownershipNewOwnerId: "",
    _ownershipReason: "",
    _ownershipSubmitting: false,
    _ownershipError: "" as string,
    loadChatParticipants: async () => {},
    ...overrides,
  };
}

describe("ownershipActions.openOwnershipTransferModal", () => {
  test("opens the modal and resets fields when activeChat is set", () => {
    const ctx = ownershipCtx({
      _ownershipError: "stale",
      _ownershipNewOwnerId: "old-id",
      _ownershipReason: "stale reason",
    },);
    ownershipActions.openOwnershipTransferModal!.call(ctx,);
    expect(ctx._ownershipModalOpen,).toBe(true,);
    expect(ctx._ownershipError,).toBe("",);
    expect(ctx._ownershipNewOwnerId,).toBe("",);
    expect(ctx._ownershipReason,).toBe("",);
  });

  test("no-ops without activeChat", () => {
    const ctx = ownershipCtx({ activeChat: null, },);
    ownershipActions.openOwnershipTransferModal!.call(ctx,);
    expect(ctx._ownershipModalOpen,).toBe(false,);
  });
});

describe("ownershipActions.closeOwnershipTransferModal", () => {
  test("clears state", () => {
    const ctx = ownershipCtx({
      _ownershipModalOpen: true,
      _ownershipSubmitting: true,
      _ownershipError: "oops",
    },);
    ownershipActions.closeOwnershipTransferModal!.call(ctx,);
    expect(ctx._ownershipModalOpen,).toBe(false,);
    expect(ctx._ownershipSubmitting,).toBe(false,);
    expect(ctx._ownershipError,).toBe("",);
  });
});

describe("ownershipActions.submitOwnershipTransfer", () => {
  test("no-ops without activeChat", async () => {
    const ctx = ownershipCtx({ activeChat: null, },);
    await ownershipActions.submitOwnershipTransfer!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
    expect(ctx._ownershipSubmitting,).toBe(false,);
  });

  test("surfaces validation error when no newOwnerId selected", async () => {
    const ctx = ownershipCtx({ _ownershipNewOwnerId: "", },);
    await ownershipActions.submitOwnershipTransfer!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
    expect(ctx._ownershipError,).toBe("Select a participant",);
    expect(ctx._ownershipSubmitting,).toBe(false,);
  });

  test("POSTs to /api/v1/chats/:id/transfer-ownership and refreshes participants on success", async () => {
    mockFetch(200, {
      ok: true,
      previousOwnerId: "old-owner",
      newOwnerId: "new-owner",
      autoInvited: true,
      meta: { api_version: "1", },
    },);
    let reloaded = 0;
    const ctx = ownershipCtx({
      _ownershipNewOwnerId: "new-owner",
      _ownershipReason: "stepping down",
      loadChatParticipants: async () => {
        reloaded++;
      },
    },);
    await ownershipActions.submitOwnershipTransfer!.call(ctx,);

    expect(fetchCalls,).toHaveLength(1,);
    const call = fetchCalls[0]!;
    expect(call.url,).toBe("/api/v1/chats/chat-1/transfer-ownership",);
    expect(call.opts.method,).toBe("POST",);
    expect(JSON.parse(call.opts.body as string,),).toEqual({
      newOwnerId: "new-owner",
      confirm: true,
      reason: "stepping down",
    },);
    expect(ctx._ownershipModalOpen,).toBe(false,);
    expect(ctx._ownershipSubmitting,).toBe(false,);
    expect(ctx._ownershipError,).toBe("",);
    expect(reloaded,).toBe(1,);
  });

  test("surfaces server-side error message when response is non-ok", async () => {
    mockFetch(403, { error: "Only the current owner may transfer", code: "FORBIDDEN", meta: { api_version: "1", }, },);
    const ctx = ownershipCtx({
      _ownershipNewOwnerId: "new-owner",
    },);
    await ownershipActions.submitOwnershipTransfer!.call(ctx,);
    expect(ctx._ownershipError,).toBe("Only the current owner may transfer",);
    expect(ctx._ownershipModalOpen,).toBe(false,); // stays closed on error
    expect(ctx._ownershipSubmitting,).toBe(false,);
  });

  test("error envelope: matches real { error, code, meta } shape from jsonError", async () => {
    // Real production envelope from src/routes/http-utils/responses.ts:
    //   jsonError(...) returns `{ error, code, meta }`. Pin the consumer reads
    //   `body.error` (NOT body.message, NOT body.data) — the old code read
    //   body.message which always came back undefined in production.
    mockFetch(403, { error: "Forbidden", code: "FORBIDDEN", meta: { api_version: "1", }, },);
    const ctx = ownershipCtx({ _ownershipNewOwnerId: "new-owner", },);
    await ownershipActions.submitOwnershipTransfer!.call(ctx,);
    expect(ctx._ownershipError,).toBe("Forbidden",);
  });

  test("falls back to HTTP status when error body is non-JSON", async () => {
    fetchHandler = () => new Response("plain text", { status: 500, },);
    const ctx = ownershipCtx({ _ownershipNewOwnerId: "new-owner", },);
    await ownershipActions.submitOwnershipTransfer!.call(ctx,);
    expect(ctx._ownershipError,).toBe("HTTP 500",);
  });

  test("catches network errors and surfaces them", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const ctx = ownershipCtx({ _ownershipNewOwnerId: "new-owner", },);
    await ownershipActions.submitOwnershipTransfer!.call(ctx,);
    expect(ctx._ownershipError,).toBe("offline",);
  });

  test("omits reason when empty", async () => {
    mockFetch(200, { ok: true, previousOwnerId: "a", newOwnerId: "b", autoInvited: false, },);
    const ctx = ownershipCtx({
      _ownershipNewOwnerId: "new-owner",
      _ownershipReason: "   ",
    },);
    await ownershipActions.submitOwnershipTransfer!.call(ctx,);
    expect(JSON.parse(fetchCalls[0]!.opts.body as string,),).toEqual({ newOwnerId: "new-owner", confirm: true, },);
  });
});

describe("ownershipActions.canTransferOwnership", () => {
  test("true when activeChat is set", () => {
    expect(ownershipActions.canTransferOwnership!.call(ownershipCtx(),),).toBe(true,);
  });
  test("false when no activeChat", () => {
    expect(ownershipActions.canTransferOwnership!.call(ownershipCtx({ activeChat: null, },),),).toBe(false,);
  });
  test("false when activeChat is empty string", () => {
    expect(ownershipActions.canTransferOwnership!.call(ownershipCtx({ activeChat: "", },),),).toBe(false,);
  });
});
