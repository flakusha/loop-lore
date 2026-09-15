// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import {
  chatTransfer,
  chatTransferFactory,
  type ChatTransferState,
} from "./chat-transfer";

// ── Mock ../htmx (must precede importing ./chat-transfer) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({}, { status: 404, },);

mock.module("./htmx", () => ({
  apiFetch: ((url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

const baseCtx = (): ChatTransferState => {
  const state = Object.create(chatTransfer,) as ChatTransferState;
  state._txChatId = null;
  state.newOwnerId = "";
  state.reason = "";
  state.confirm = false;
  state.busy = false;
  state.message = "";
  state.error = "";
  state.lastResult = null;
  return state;
};

afterEach(() => {
  calls = [];
  handler = async () => Response.json({}, { status: 404, },);
},);

describe("chatTransfer.setChatId", () => {
  test("binds and clears prior state", () => {
    const ctx = baseCtx();
    ctx.setChatId("chat-1",);
    expect(ctx._txChatId,).toBe("chat-1",);
    expect(ctx.newOwnerId,).toBe("",);
  });

  test("no-op when chat unchanged", () => {
    const ctx = baseCtx();
    ctx.setChatId("chat-1",);
    ctx.error = "old";
    ctx.setChatId("chat-1",);
    expect(ctx.error,).toBe("old",);
  });
});

describe("chatTransfer.canSubmit", () => {
  test("false without chat", () => {
    const ctx = baseCtx();
    ctx.newOwnerId = "user-2";
    ctx.confirm = true;
    expect(ctx.canSubmit(),).toBe(false,);
  });

  test("false without newOwnerId", () => {
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.confirm = true;
    expect(ctx.canSubmit(),).toBe(false,);
  });

  test("false without confirm", () => {
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.newOwnerId = "user-2";
    expect(ctx.canSubmit(),).toBe(false,);
  });

  test("true with all fields", () => {
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.newOwnerId = "user-2";
    ctx.confirm = true;
    expect(ctx.canSubmit(),).toBe(true,);
  });

  test("false when busy", () => {
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.newOwnerId = "user-2";
    ctx.confirm = true;
    ctx.busy = true;
    expect(ctx.canSubmit(),).toBe(false,);
  });

  test("ignores whitespace-only newOwnerId", () => {
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.newOwnerId = "   ";
    ctx.confirm = true;
    expect(ctx.canSubmit(),).toBe(false,);
  });
});

describe("chatTransfer.submit", () => {
  test("no-op without chat", async () => {
    const ctx = baseCtx();
    ctx.newOwnerId = "user-2";
    ctx.confirm = true;
    expect(await ctx.submit(),).toBe(false,);
    expect(ctx.error,).toBeTruthy();
    expect(calls,).toHaveLength(0,);
  });

  test("no-op without newOwnerId", async () => {
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.confirm = true;
    expect(await ctx.submit(),).toBe(false,);
    expect(ctx.error,).toBeTruthy();
    expect(calls,).toHaveLength(0,);
  });

  test("no-op without confirm", async () => {
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.newOwnerId = "user-2";
    expect(await ctx.submit(),).toBe(false,);
    expect(ctx.error,).toBeTruthy();
  });

  test("POSTs payload + stores outcome", async () => {
    handler = async () =>
      Response.json({
        ok: true,
        chatId: "chat-1",
        previousOwnerId: "user-1",
        newOwnerId: "user-2",
        autoInvited: false,
      },);
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.newOwnerId = "user-2";
    ctx.reason = "stepping down";
    ctx.confirm = true;
    const ok = await ctx.submit();
    expect(ok,).toBe(true,);
    const postCall = calls.find((c,) => c.opts.method === "POST");
    expect(postCall?.url,).toBe("/api/chats/chat-1/transfer-ownership",);
    expect(JSON.parse(String(postCall?.opts.body ?? "{}",),),).toMatchObject({
      newOwnerId: "user-2",
      confirm: true,
      reason: "stepping down",
    },);
    expect(ctx.lastResult?.ok,).toBe(true,);
    expect(ctx.message,).toBeTruthy();
    // Destructive fields reset on success
    expect(ctx.confirm,).toBe(false,);
    expect(ctx.reason,).toBe("",);
  });

  test("omits empty reason from payload", async () => {
    handler = async () =>
      Response.json({ ok: true, chatId: "c", previousOwnerId: "a", newOwnerId: "b", autoInvited: false, },);
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.newOwnerId = "user-2";
    ctx.confirm = true;
    await ctx.submit();
    const postCall = calls.find((c,) => c.opts.method === "POST");
    expect(JSON.parse(String(postCall?.opts.body ?? "{}",),),).toEqual({
      newOwnerId: "user-2",
      confirm: true,
    },);
  });

  test("captures server message on non-200", async () => {
    handler = async () => Response.json({ message: "not owner", }, { status: 403, },);
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.newOwnerId = "user-2";
    ctx.confirm = true;
    expect(await ctx.submit(),).toBe(false,);
    expect(ctx.error,).toBe("not owner",);
  });

  test("records generic error on network failure", async () => {
    handler = async () => {
      throw new Error("net",);
    };
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.newOwnerId = "user-2";
    ctx.confirm = true;
    expect(await ctx.submit(),).toBe(false,);
    expect(ctx.error,).toBeTruthy();
  });

  test("no-op when busy", async () => {
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.newOwnerId = "user-2";
    ctx.confirm = true;
    ctx.busy = true;
    expect(await ctx.submit(),).toBe(false,);
    expect(calls,).toHaveLength(0,);
  });
});

describe("chatTransfer.reset", () => {
  test("clears all fields and status", () => {
    const ctx = baseCtx();
    ctx._txChatId = "chat-1";
    ctx.newOwnerId = "u";
    ctx.reason = "r";
    ctx.confirm = true;
    ctx.message = "ok";
    ctx.error = "fail";
    ctx.lastResult = { ok: true, chatId: "c", previousOwnerId: "a", newOwnerId: "b", autoInvited: false, };
    ctx.reset();
    expect(ctx.newOwnerId,).toBe("",);
    expect(ctx.reason,).toBe("",);
    expect(ctx.confirm,).toBe(false,);
    expect(ctx.message,).toBe("",);
    expect(ctx.error,).toBe("",);
    expect(ctx.lastResult,).toBeNull();
  });
});

describe("chatTransferFactory", () => {
  test("returns a fresh state bound to the chat", () => {
    const a = chatTransferFactory("chat-a",);
    const b = chatTransferFactory("chat-b",);
    expect(a,).not.toBe(b,);
    expect(a._txChatId,).toBe("chat-a",);
    expect(b._txChatId,).toBe("chat-b",);
  });
});
