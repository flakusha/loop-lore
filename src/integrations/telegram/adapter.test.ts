// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** TelegramAdapter tests: envelope framing, ok:false, 429 retry_after, and
 * call-time token override. All transport calls are in-memory. */
import { describe, expect, test, } from "bun:test";
import type { AdapterMessage, } from "../adapter";
import {
  createTelegramAdapter,
  isTelegramChatId,
  TELEGRAM_ADAPTER_NAME,
  TelegramAdapterError,
  type TelegramApiResponse,
  type TelegramTransport,
} from "./adapter";

type Call = { token: string; chatId: string; text: string };

function fakeTransport(
  respond: (call: Call,) => TelegramApiResponse,
): { transport: TelegramTransport; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    transport: {
      async sendMessage(token, chatId, text,) {
        calls.push({ token, chatId, text, },);
        return respond(calls[calls.length - 1]!,);
      },
    },
  };
}

const message = (): AdapterMessage => ({
  id: "local",
  author: "bot",
  target: "12345",
  body: "code",
  timestamp: 1,
});

describe("TelegramAdapter", () => {
  test("sends chat_id/text via the transport and returns String(message_id)", async () => {
    const { transport, calls, } = fakeTransport(() => ({ ok: true, result: { message_id: 42, }, }));
    const adapter = createTelegramAdapter({ transport, },);
    await adapter.connect({ botToken: "bot-token", },);

    expect(await adapter.sendMessage("12345", message(),),).toBe("42",);
    expect(calls,).toEqual([{ token: "bot-token", chatId: "12345", text: "code", },],);
  });

  test("preserves message_id 0 instead of treating it as a missing id", async () => {
    const { transport, } = fakeTransport(() => ({ ok: true, result: { message_id: 0, }, }));
    const adapter = createTelegramAdapter({ transport, },);
    await adapter.connect({ botToken: "bot-token", },);
    expect(await adapter.sendMessage("12345", message(),),).toBe("0",);
  });

  test("an ok:false envelope fails typed without throwing raw", async () => {
    const { transport, } = fakeTransport(() => ({
      ok: false,
      error_code: 400,
      description: "Bad Request: chat not found",
    }));

    const adapter = createTelegramAdapter({ transport, },);
    await adapter.connect({ botToken: "bot-token", },);

    try {
      await adapter.sendMessage("12345", message(),);
      throw new Error("expected failure",);
    } catch (cause) {
      expect(cause,).toBeInstanceOf(TelegramAdapterError,);
      expect(cause,).toMatchObject({ code: "send_failed", },);
    }
  });

  test("a malformed wire envelope fails typed instead of crashing on field access", async () => {
    // Simulate JSON that parsed to something other than the documented shape.
    const transport: TelegramTransport = {
      sendMessage: async () => null as unknown as TelegramApiResponse,
    };

    const adapter = createTelegramAdapter({ transport, },);
    await adapter.connect({ botToken: "bot-token", },);

    try {
      await adapter.sendMessage("12345", message(),);
      throw new Error("expected failure",);
    } catch (cause) {
      expect(cause,).toBeInstanceOf(TelegramAdapterError,);
      expect(cause,).toMatchObject({ code: "send_failed", },);
    }
  });

  test("a 429 envelope surfaces retry_after seconds as ms", async () => {
    const { transport, } = fakeTransport(() => ({
      ok: false,
      error_code: 429,
      description: "Too Many Requests",
      parameters: { retry_after: 7, },
    }));

    const adapter = createTelegramAdapter({ transport, },);
    await adapter.connect({ botToken: "bot-token", },);

    try {
      await adapter.sendMessage("12345", message(),);
      throw new Error("expected failure",);
    } catch (cause) {
      expect(cause,).toBeInstanceOf(TelegramAdapterError,);
      expect(cause,).toMatchObject({ code: "rate_limited", retryAfterMs: 7_000, },);
    }
  });

  test("sendWithToken uses the call-time token, not the connected one", async () => {
    const { transport, calls, } = fakeTransport(() => ({ ok: true, result: { message_id: 1, }, }));
    const adapter = createTelegramAdapter({ transport, },);
    await adapter.connect({ botToken: "stale-token", },);

    await adapter.sendWithToken("rotated-token", "12345", message(),);
    expect(calls[0]!.token,).toBe("rotated-token",);
  });

  test("ownsTarget accepts numeric chat ids only", () => {
    const adapter = createTelegramAdapter();
    expect(adapter.ownsTarget?.("12345",),).toBe(true,);
    expect(adapter.ownsTarget?.("-1001234567890",),).toBe(true,);
    expect(adapter.ownsTarget?.("@user:matrix.org",),).toBe(false,);
    expect(adapter.ownsTarget?.("user@example.com",),).toBe(false,);
    expect(adapter.ownsTarget?.("123abc",),).toBe(false,);
  });

  test("advertises the auth-challenge capability and no encryption", () => {
    const adapter = createTelegramAdapter();
    expect(adapter.capabilities(),).toEqual(["auth-challenge",],);
    expect(adapter.isEncrypted(),).toBe(false,);
  });

  test("names the adapter and guards chat-id shapes for the MFA bridge", () => {
    expect(TELEGRAM_ADAPTER_NAME,).toBe("telegram",);
    expect(isTelegramChatId("12345",),).toBe(true,);
    expect(isTelegramChatId("@user:matrix.org",),).toBe(false,);
  });
});
