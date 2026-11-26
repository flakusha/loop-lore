// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/telegram/adapter.ts — TelegramAdapter, the Telegram
// ProtocolAdapter. Protocol framing (Bot API sendMessage envelope) lives here;
// the HTTP call sits behind the injected {@link TelegramTransport} seam so
// tests never touch the network.

import { safeFetch, } from "../../utils/safe-fetch";
import type { AdapterMessage, ProtocolAdapter, } from "../adapter";

/** Adapter identity used for registry registration and token binding. */
export const TELEGRAM_ADAPTER_NAME = "telegram";

/** Telegram Bot API endpoint prefix — the token is appended to build the URL. */
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

/** Typed adapter failures: `not_configured` means no connected adapter/token;
 * `rate_limited` carries the upstream `retry_after` normalized to ms;
 * `send_failed` covers every other `ok:false` envelope. */
export class TelegramAdapterError extends Error {
  readonly code: "not_configured" | "rate_limited" | "send_failed";
  /** Upstream 429 delay in ms; present only on `rate_limited`. */
  readonly retryAfterMs: number | undefined;

  constructor(opts: {
    code: "not_configured" | "rate_limited" | "send_failed";
    message: string;
    retryAfterMs?: number;
  },) {
    super(opts.message,);
    this.name = "TelegramAdapterError";
    this.code = opts.code;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/** Bot API sendMessage response envelope: failures arrive as HTTP 200 with
 * `ok:false`; a 429 carries `parameters.retry_after` in seconds. */
export interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id: number };
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

/** Runtime guard for the wire envelope: `safeFetch` only statically casts
 * parsed JSON, so a malformed payload must fail typed, never crash on field
 * access. Nested fields are checked too — presence alone is not a shape. */
function isTelegramApiResponse(value: unknown,): value is TelegramApiResponse {
  if (typeof value !== "object" || value === null || !("ok" in value) || typeof value.ok !== "boolean") {
    return false;
  }

  if (value.ok) {
    return "result" in value && typeof value.result === "object" && value.result !== null &&
      "message_id" in value.result && typeof value.result.message_id === "number";
  }

  return (!("error_code" in value) || typeof value.error_code === "number") &&
    (!("description" in value) || typeof value.description === "string") &&
    (!("parameters" in value) || (
      typeof value.parameters === "object" && value.parameters !== null &&
      (!("retry_after" in value.parameters) || typeof value.parameters.retry_after === "number")
    ));
}

/** HTTP seam: the only thing that talks to api.telegram.org. Tests inject an
 * in-memory implementation; production uses a fetch-based one. */
export interface TelegramTransport {
  sendMessage(token: string, chatId: string, text: string,): Promise<TelegramApiResponse>;
}

/** Build the production transport. The token is only ever placed in the
 * request URL — it is never logged or included in an error message. */
function createHttpTransport(): TelegramTransport {
  return {
    async sendMessage(token, chatId, text,) {
      const result = await safeFetch<TelegramApiResponse>(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
        method: "POST",
        body: { chat_id: chatId, text, },
      },);

      if (!result.ok) {
        // A non-2xx refusal carries no Bot API envelope; synthesize one.
        // Status is enough — the raw error may quote the token-bearing URL.
        return { ok: false, error_code: result.status, description: "Telegram API request failed", };
      }

      return result.data;
    },
  };
}

/** Telegram adapter: ProtocolAdapter plus a call-time-token send used by the
 * MFA bridge, so an admin-rotated system_config token reaches the Bot API
 * without rebuilding the bridge or reconnecting the adapter. */
export interface TelegramAdapter extends ProtocolAdapter {
  sendWithToken(token: string, target: string, message: AdapterMessage,): Promise<string>;
}

/** Options for {@link createTelegramAdapter}. */
export interface TelegramAdapterOptions {
  /** Transport seam; defaults to a fetch-based Bot API call. */
  transport?: TelegramTransport;
}

/** Numeric chat-id shape: signed decimal digits, kept as a string (Telegram
 * ids can exceed Number.MAX_SAFE_INTEGER). */
export function isTelegramChatId(target: string,): boolean {
  return /^-?\d{1,19}$/.test(target,);
}

/**
 * Build the Telegram adapter. `connect` binds a fallback bot token; the
 * bridge may override it per send with a freshly read system_config token.
 * @param options Transport seam.
 * @returns The adapter.
 */
export function createTelegramAdapter(options: TelegramAdapterOptions = {},): TelegramAdapter {
  const transport = options.transport ?? createHttpTransport();
  let botToken = "";
  let connected = false;

  async function send(
    token: string,
    target: string,
    message: Omit<AdapterMessage, "id" | "target">,
  ): Promise<string> {
    const effective = token.trim() === "" ? botToken : token;
    if (!connected || effective === "") {
      throw new TelegramAdapterError({
        code: "not_configured",
        message: "telegram adapter send: not connected/configured",
      },);
    }

    const response = await transport.sendMessage(effective, target, message.body,);
    if (!isTelegramApiResponse(response,)) {
      throw new TelegramAdapterError({
        code: "send_failed",
        message: "telegram send failed: malformed API response",
      },);
    }

    if (!response.ok) {
      const retryAfter = response.parameters?.retry_after;
      if (
        response.error_code === 429 || retryAfter !== undefined ||
        /\b429\b/i.test(response.description ?? "",)
      ) {
        const seconds = typeof retryAfter === "number" && Number.isFinite(retryAfter,) && retryAfter > 0
          ? retryAfter
          : 1;

        throw new TelegramAdapterError({
          code: "rate_limited",
          message: `telegram rate limited: ${response.description ?? "429"}`,
          retryAfterMs: seconds * 1_000,
        },);
      }

      throw new TelegramAdapterError({
        code: "send_failed",
        message: `telegram send failed: ${response.description ?? "unknown error"}`,
      },);
    }

    const messageId = response.result?.message_id;
    if (typeof messageId !== "number" || !Number.isFinite(messageId,)) {
      throw new TelegramAdapterError({
        code: "send_failed",
        message: "telegram send returned no message_id",
      },);
    }

    // message_id may be 0 — preserve it verbatim, never treat it as falsy.
    return String(messageId,);
  }

  return {
    name: TELEGRAM_ADAPTER_NAME,
    protocol: TELEGRAM_ADAPTER_NAME,

    async connect(config,) {
      const record = typeof config === "object" && config !== null
        ? config as Record<string, unknown>
        : {};

      botToken = typeof record.botToken === "string" ? record.botToken.trim() : "";
      connected = true;
    },

    async disconnect() {
      connected = false;
    },

    isConnected: () => connected,
    isEncrypted: () => false,
    capabilities: () => ["auth-challenge",],
    ownsTarget: (target,) => isTelegramChatId(target,),
    sendMessage(target, message,) {
      return send("", target, message,);
    },
    sendWithToken(token, target, message,) {
      return send(token, target, message,);
    },
    // Outbound-only: MFA challenges are never delivered as inbound updates.
    onMessage() {/* outbound-only */},
  };
}
