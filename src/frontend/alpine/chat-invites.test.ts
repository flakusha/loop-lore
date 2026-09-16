// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "./i18n.test-helper";
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { chatInvites, } from "./chat-invites";
import type { ChatState, } from "./types";

let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("./htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    fetchCalls.push({ url, opts: opts ?? {}, },);
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

interface Toast {
  type: string;
  message: string;
}

function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

function buildCtx(
  overrides: {
    activeChat?: string | null;
    toasts?: Toast[];
    loadChats?: () => Promise<void>;
    selectChat?: (id: string,) => Promise<void>;
  } = {},
): ChatState {
  const toasts: Toast[] = overrides.toasts ?? [];
  const base: Record<string, unknown> = {
    activeChat: overrides.activeChat === undefined ? "chat-1" : overrides.activeChat,
    _chatInvites: [],
    _chatInvitesLoading: false,
    _chatInvitesLoaded: false,
    _newChatInviteMaxUses: "",
    _showChatInviteForm: false,
    _chatJoinCode: "",
    loadChats: overrides.loadChats ?? (async () => {}),
    selectChat: overrides.selectChat ?? (async () => {}),
    $dispatch(event: string, detail: Record<string, unknown>,) {
      if (event === "show-toast") {
        toasts.push({ type: detail.type as string, message: detail.message as string, },);
      }
    },
  };
  Object.assign(base, chatInvites,);
  return base as unknown as ChatState;
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  globalThis.confirm = () => true;
},);

describe("chatInvites", () => {
  describe("loadChatInvites", () => {
    test("returns early without an active chat", async () => {
      const ctx = buildCtx({ activeChat: null, },);
      await chatInvites.loadChatInvites!.call(ctx,);
      expect(fetchCalls,).toEqual([],);
    });

    test("stores { data } rows and marks loaded", async () => {
      mockFetch(200, { data: [{ id: "i1", code: "ABC", },], },);
      const ctx = buildCtx();
      await chatInvites.loadChatInvites!.call(ctx,);
      expect(fetchCalls[0]!.url,).toBe("/api/chats/chat-1/invites",);
      expect(ctx._chatInvites,).toHaveLength(1,);
      expect(ctx._chatInvitesLoaded,).toBe(true,);
      expect(ctx._chatInvitesLoading,).toBe(false,);
    });
  });

  describe("createChatInvite", () => {
    test("rejects non-positive maxUses without a fetch", async () => {
      const toasts: Toast[] = [];
      const ctx = buildCtx({ toasts, },);
      ctx._newChatInviteMaxUses = "0";
      await chatInvites.createChatInvite!.call(ctx,);
      expect(fetchCalls,).toEqual([],);
      expect(toasts,).toEqual([{ type: "error", message: "Max uses must be a positive integer", },],);
    });

    test("prepends the invite, resets the form, and toasts the code", async () => {
      mockFetch(201, { id: "i2", code: "XYZ", },);
      const toasts: Toast[] = [];
      const ctx = buildCtx({ toasts, },);
      ctx._newChatInviteMaxUses = "5";
      ctx._showChatInviteForm = true;
      await chatInvites.createChatInvite!.call(ctx,);
      expect(fetchCalls[0]!.url,).toBe("/api/chats/chat-1/invites",);
      expect(ctx._chatInvites[0]?.code,).toBe("XYZ",);
      expect(ctx._newChatInviteMaxUses,).toBe("",);
      expect(ctx._showChatInviteForm,).toBe(false,);
      expect(toasts,).toEqual([{ type: "success", message: "Invite XYZ created and copied", },],);
    });
  });

  describe("revokeChatInvite", () => {
    test("removes the row on 204 and toasts", async () => {
      mockFetch(204, {},);
      const toasts: Toast[] = [];
      const ctx = buildCtx({ toasts, },);
      ctx._chatInvites = [{ id: "i1", code: "ABC", },] as ChatState["_chatInvites"];
      await chatInvites.revokeChatInvite!.call(ctx, "i1",);
      expect(fetchCalls[0]!.url,).toBe("/api/chats/chat-1/invites/i1",);
      expect(ctx._chatInvites,).toEqual([],);
      expect(toasts,).toEqual([{ type: "success", message: "Invite revoked", },],);
    });
  });

  describe("joinChatByCode", () => {
    test("warns on a blank code without a fetch", async () => {
      const toasts: Toast[] = [];
      const ctx = buildCtx({ toasts, },);
      ctx._chatJoinCode = "   ";
      await chatInvites.joinChatByCode!.call(ctx,);
      expect(fetchCalls,).toEqual([],);
      expect(toasts,).toEqual([{ type: "warning", message: "Enter a chat invite code", },],);
    });

    test("clears the code, reloads chats, and selects the joined chat", async () => {
      mockFetch(200, { chatId: "c9", alreadyMember: false, },);
      const toasts: Toast[] = [];
      let loaded = 0;
      const selected: { value: string | null } = { value: null, };
      const ctx = buildCtx({
        toasts,
        loadChats: async () => {
          loaded += 1;
        },
        selectChat: async (id: string,) => {
          selected.value = id;
        },
      },);
      ctx._chatJoinCode = "ABCDEF12";
      await chatInvites.joinChatByCode!.call(ctx,);
      expect(fetchCalls[0]!.url,).toBe("/api/invites/ABCDEF12/join",);
      expect(ctx._chatJoinCode,).toBe("",);
      expect(loaded,).toBe(1,);
      expect(selected.value,).toBe("c9",);
      expect(toasts,).toEqual([{ type: "success", message: "Joined chat", },],);
    });

    test("toasts the backend error and keeps the code", async () => {
      mockFetch(404, { message: "Invite revoked", },);
      const toasts: Toast[] = [];
      const ctx = buildCtx({ toasts, },);
      ctx._chatJoinCode = "BROKEN00";
      await chatInvites.joinChatByCode!.call(ctx,);
      expect(toasts,).toEqual([{ type: "error", message: "Invite revoked", },],);
      expect(ctx._chatJoinCode,).toBe("BROKEN00",);
    });
  });
});
