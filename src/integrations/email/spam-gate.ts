// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/email/spam-gate.ts — inbound email spam gate (spec
// federation-email-channel.md §7, TASK-email-deliverability-spf-dkim-dmarc-
// and-inbound-spam-gate).
//
// Policy layers, in order: sender block list (hard reject), per-sender
// token-bucket rate limit (hard reject), allow-list miss (score penalty),
// spam-score threshold (quarantine). Message content itself is NOT scored
// here — foreign content moderation is the shared bridge moderation gate
// (integrations-architecture.md §6); this gate owns the email-specific
// envelope policy and the quarantine folder.
//
// The gate is synchronous so the bridge can consult it on the inbound path
// (MessageBridgeOptions.inboundGate — federation-email-channel.md §9:
// "sender blocklist consulted by the bridge") without turning `receive`
// async. It imports no protocol library (lazy-load rule, §8.3).

import type { AdapterMessage, } from "../adapter";
import { createAdapterRateLimiter, type RateLimitRule, } from "../health";

/** Default per-sender bucket: burst 10, refill one per minute. */
export const DEFAULT_PER_SENDER_LIMIT: RateLimitRule = { capacity: 10, refillMs: 60_000, };

/** Default spam-score threshold that moves mail to quarantine. */
export const DEFAULT_SPAM_THRESHOLD = 50;

/** Score penalty for a sender missing from a configured allow list. Equal
 * to the default threshold: with an allow list configured, mail from an
 * unknown sender quarantines unless the operator lowers the threshold. */
export const NOT_ON_ALLOW_LIST_SCORE = 50;

/** Quarantine entries retained before the oldest is evicted. */
export const DEFAULT_MAX_QUARANTINED = 128;

/** Hard-reject reasons; everything softer quarantines. */
export type SpamRejectCode = "blocked_sender" | "rate_limited";

/** Verdict of {@link EmailSpamGate.check}. */
export type SpamVerdict =
  | { action: "deliver"; score: number; reasons: readonly string[] }
  | { action: "quarantine"; score: number; reasons: readonly string[] }
  | { action: "reject"; code: SpamRejectCode; score: number; reasons: readonly string[]; retryAfterMs?: number };

/** One quarantined mail: the envelope plus why it was held. */
export interface QuarantinedEmail {
  /** Sender address (normalized, lowercase). */
  sender: string;
  /** The original inbound envelope. */
  message: AdapterMessage;
  /** Spam score at quarantine time. */
  score: number;
  /** Human-readable policy reasons. */
  reasons: readonly string[];
  /** Quarantine timestamp (ms since epoch, injected clock). */
  quarantinedAt: number;
}

/** Options for {@link createEmailSpamGate} — everything defaults to the
 * documented defaults; pass no lists for an allow-everything gate. */
export interface EmailSpamGateOptions {
  /** Senders always delivered; address match, case-insensitive. */
  allowList?: readonly string[];
  /** Senders hard-rejected before any scoring or rate accounting. */
  blockList?: readonly string[];
  /** Per-sender token bucket; `null` disables rate limiting. */
  perSender?: RateLimitRule | null;
  /** Score at or above which mail is quarantined. */
  spamThreshold?: number;
  /** Quarantine retention cap (oldest evicted past the cap). */
  maxQuarantined?: number;
  /** Clock injection for deterministic tests; default `Date.now`. */
  now?: () => number;
}

/** Inbound email policy gate consulted by the bridge. */
export interface EmailSpamGate {
  /** Score one inbound mail; quarantine verdicts also file the envelope. */
  check(message: AdapterMessage,): SpamVerdict;
  /** Current quarantine folder, oldest first. */
  quarantined(): readonly QuarantinedEmail[];
  /** Clear quarantine and rate-limit state (admin/test reset). */
  reset(): void;
}

/** Extract and normalize the bare address from a From envelope
 * (`Display Name <user@host>` → `user@host`), lowercased. Shared by the
 * family: the spam gate scores on it, the adapter maps From → author.
 * @param raw Raw author/from value.
 * @returns The bare lowercase address, or the empty-ish raw value.
 */
export function senderAddress(raw: string,): string {
  const angled = /<([^>]*)>/.exec(raw,);
  return (angled === null ? raw : angled[1] ?? raw).trim().toLowerCase();
}

/**
 * Build the inbound email spam gate. Reuses the health module's token-bucket
 * limiter for per-sender budgets — one bucket implementation, two policies.
 * @param options Allow/block lists, rate rule, threshold, clock injection.
 * @returns The gate instance.
 */
export function createEmailSpamGate(options: EmailSpamGateOptions = {},): EmailSpamGate {
  const now = options.now ?? (() => Date.now());
  const allowList = new Set((options.allowList ?? []).map(senderAddress,),);
  const blockList = new Set((options.blockList ?? []).map(senderAddress,),);
  const threshold = options.spamThreshold ?? DEFAULT_SPAM_THRESHOLD;
  const maxQuarantined = options.maxQuarantined ?? DEFAULT_MAX_QUARANTINED;
  const limiter = createAdapterRateLimiter({
    // `perSender: null` disables limiting: an empty protocol table means
    // every consume() passes (health.ts rule resolution).
    protocols: options.perSender === null ? {} : { email: options.perSender ?? DEFAULT_PER_SENDER_LIMIT, },
    now,
  },);

  const quarantine: QuarantinedEmail[] = [];

  return {
    check(message,) {
      const sender = senderAddress(message.author,);

      if (blockList.has(sender,)) {
        return { action: "reject", code: "blocked_sender", score: 0, reasons: ["sender is blocklisted",], };
      }

      // Bucket key: sender as the adapter dimension, a fixed target — the
      // budget is per sender, shared across all inbound targets.
      const budget = limiter.consume(sender, "email", "inbound",);
      if (!budget.ok) {
        return {
          action: "reject",
          code: "rate_limited",
          score: 0,
          reasons: ["per-sender rate limit exhausted",],
          retryAfterMs: budget.retryAfterMs,
        };
      }

      const reasons: string[] = [];
      if (allowList.size > 0 && !allowList.has(sender,)) {
        reasons.push(`sender is not on the allow list (+${NOT_ON_ALLOW_LIST_SCORE})`,);
      }

      const score = reasons.length * NOT_ON_ALLOW_LIST_SCORE;

      if (score >= threshold) {
        const entry: QuarantinedEmail = {
          sender,
          message,
          score,
          reasons,
          quarantinedAt: now(),
        };

        quarantine.push(entry,);
        if (quarantine.length > maxQuarantined) { quarantine.shift(); }
        return { action: "quarantine", score, reasons, };
      }

      return { action: "deliver", score, reasons, };
    },
    quarantined() {
      return [...quarantine,];
    },
    reset() {
      quarantine.length = 0;
      limiter.reset();
    },
  };
}
