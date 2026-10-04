// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/bridge.ts — the MessageBridge seam (spec §2.2, §4).
//
// Outbound: resolve the target via the registry, run the outbound moderation
// gate, stamp a loop-lore idempotency key, delegate to the adapter. Inbound:
// `receive` is the single ingestion point (adapter wiring / the webhook
// surface call it); it dedups on (adapter, protocol message id), consults
// the optional inbound policy gate (spam, allow/block lists), then dispatches
// to the `onMessage` handler.
//
// Retry/backoff and degradation policy are follow-up work: the Result
// shapes below are the extension points — send() never throws. Health
// tracking and per-(adapter, target) rate limiting are wired from
// ./health when supplied in the options (spec §4.4, §10).

import type { AdapterMessage, AdapterMessageHandler, } from "./adapter";
import { type AdapterHealth, type AdapterRateLimiter, classifyAdapterFailure, } from "./health";
import { type BridgeRegistry, unknownTargetResult, } from "./registry";

/** Moderation verdict — `allowed: false` short-circuits the send. */
export type ModerationVerdict =
  | { allowed: true }
  | { allowed: false; reason: string };

/** Outbound moderation-gate hook; invoked before every send. */
export type ModerationGate = (message: AdapterMessage,) => Promise<ModerationVerdict>;

/** Inbound gate verdict — `ok: false` drops the message before dispatch. */
export type InboundGateVerdict =
  | { ok: true }
  | { ok: false; code: "inbound_blocked"; message: string };

/** Synchronous inbound policy gate (spam, allow/block lists); consulted
 * after dedup, before dispatch. The email family supplies the spam gate
 * (src/integrations/email/spam-gate.ts). */
export type InboundGate = (message: AdapterMessage,) => InboundGateVerdict;

/** Typed failure of `MessageBridge.send` — never a throw. */
export type BridgeSendError =
  | { ok: false; code: "unknown_target"; message: string }
  | { ok: false; code: "moderation_blocked"; message: string; reason: string }
  | { ok: false; code: "rate_limited"; message: string; retryAfterMs: number }
  | { ok: false; code: "send_failed"; message: string; cause?: unknown };

/** Result of `send`: the routed adapter, its protocol id, and the stamped key. */
export type BridgeSendResult =
  | { ok: true; adapter: string; id: string; idempotencyKey: string }
  | BridgeSendError;

/** Options for {@link createMessageBridge} — all optional. */
export interface MessageBridgeOptions {
  /** Outbound moderation gate; default allows everything. */
  moderationGate?: ModerationGate;
  /** Inbound dedup TTL in ms; default 24h (messages.idempotencyExpiryHours). */
  dedupTtlMs?: number;
  /** Adapter health tracker; when present, send/receive outcomes feed it. */
  health?: AdapterHealth;
  /** Per-(adapter, target) rate limiter; gates every outbound send. */
  rateLimiter?: AdapterRateLimiter;
  /** Inbound policy gate; a not-ok verdict drops the message before dispatch. */
  inboundGate?: InboundGate;
  /** Clock injection for tests; default `Date.now`. */
  now?: () => number;
}

/** Routes loop-lore chats to/from registered protocol adapters (spec §2.2). */
export interface MessageBridge {
  /** Route `message` to the adapter owning `target`.
   * @throws never — failures return typed {@link BridgeSendError} results. */
  send(target: string, message: AdapterMessage,): Promise<BridgeSendResult>;
  /** Register the inbound handler (replaces any previous). */
  onMessage(handler: AdapterMessageHandler,): void;
  /** Ingest an inbound message from `adapterName`: dedup on (adapter, id)
   * against already-dispatched deliveries, then consult the inbound policy
   * gate BEFORE recording — a blocked message stays unrecorded for
   * redelivery (policy changes apply on retry), a dispatch dedups.
   * @throws {Error} Propagates `inboundGate`/handler failures; the message
   * stays unrecorded, so gate implementations should be total functions.
   * @returns true when dispatched to the handler, false when dropped as a
   * duplicate or blocked by the inbound gate. */
  receive(adapterName: string, message: AdapterMessage,): boolean;
}

const DEFAULT_DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // matches messages.idempotencyExpiryHours default

/** Inbound-dedup map size that triggers an expired-entry sweep. */
const DEDUP_SWEEP_THRESHOLD = 1_024;

/**
 * Build a {@link MessageBridge} over `registry`. Adapters push inbound
 * traffic through `receive`; loop-lore consumes it via `onMessage`.
 * @param registry Adapter directory backing target resolution.
 * @param options Moderation gate, dedup TTL, health/rate-limit wiring.
 * @returns The bridge instance.
 */
export function createMessageBridge(
  registry: BridgeRegistry,
  options: MessageBridgeOptions = {},
): MessageBridge {
  const moderationGate = options.moderationGate ?? (async () => ({ allowed: true, }));
  const dedupTtlMs = options.dedupTtlMs ?? DEFAULT_DEDUP_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const health = options.health;
  const rateLimiter = options.rateLimiter;
  const inboundGate = options.inboundGate;
  const seen = new Map<string, number>();
  let handler: AdapterMessageHandler | null = null;

  function sweepExpired(nowMs: number,): void {
    for (const [key, expiresAt,] of seen) {
      if (expiresAt <= nowMs) { seen.delete(key,); }
    }
  }

  return {
    async send(target, message,) {
      const adapter = registry.resolve(target,);
      if (adapter === undefined) { return unknownTargetResult(target,); }

      // Rate-limit gate (spec §4.4): a limited target never reaches the
      // adapter — no gate call, no send.
      const budget = rateLimiter?.consume(adapter.name, adapter.protocol, target,);
      if (budget !== undefined && !budget.ok) {
        return {
          ok: false,
          code: "rate_limited",
          message: `rate limited sending to ${target} on ${adapter.name}`,
          retryAfterMs: budget.retryAfterMs,
        };
      }

      let verdict: ModerationVerdict;
      try {
        verdict = await moderationGate(message,);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : "unknown error";
        return {
          ok: false,
          code: "send_failed",
          message: `moderation gate failed for ${target}: ${detail}`,
          cause,
        };
      }

      if (!verdict.allowed) {
        return {
          ok: false,
          code: "moderation_blocked",
          message: `moderation gate blocked send to ${target}`,
          reason: verdict.reason,
        };
      }

      const idempotencyKey = message.idempotencyKey ?? crypto.randomUUID();
      const stamped: AdapterMessage = { ...message, target, idempotencyKey, };

      try {
        const id = await adapter.sendMessage(target, stamped,);
        health?.markSuccess(adapter.name,);
        return { ok: true, adapter: adapter.name, id, idempotencyKey, };
      } catch (cause) {
        const code = classifyAdapterFailure(cause,);
        health?.markFailure(adapter.name, code,);
        const detail = cause instanceof Error ? cause.message : "unknown error";
        return {
          ok: false,
          code: "send_failed",
          message: `adapter ${adapter.name} failed to send to ${target}: ${detail}`,
          cause,
        };
      }
    },
    onMessage(newHandler,) {
      handler = newHandler;
    },
    receive(adapterName, message,) {
      const nowMs = now();
      if (seen.size >= DEDUP_SWEEP_THRESHOLD) { sweepExpired(nowMs,); }

      const key = `${adapterName}\u0000${message.id}`;
      const expiresAt = seen.get(key,);
      if (expiresAt !== undefined && expiresAt > nowMs) { return false; }

      // Inbound policy gate (spam/allow/block lists): consulted BEFORE the
      // delivery is recorded, so a blocked message stays unrecorded — a
      // policy change takes effect when the provider redelivers the same
      // id, while a true duplicate (already dispatched) is deduped above.
      // A gate throw propagates (no silent swallow): the message remains
      // unrecorded for redelivery, and the message never dispatches here
      // without a pass verdict. Gate-blocked mail does not mark success.
      const gateVerdict = inboundGate?.(message,);
      if (gateVerdict !== undefined && !gateVerdict.ok) { return false; }

      seen.set(key, nowMs + dedupTtlMs,);
      handler?.(message,);
      health?.markSuccess(adapterName,);
      return true;
    },
  };
}
