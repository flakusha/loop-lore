// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/nsfw.ts — NSFW content gating config type

/** */
export interface NsfwConfig {
  /** Allow NSFW content in chats. Default true. */
  allowNsfw: boolean;
  /** Minimum age for NSFW content. Checked against user birth_date. Default 18. */
  nsfwMinAge: number;
  /** Default NSFW scope for new chats. Default "chat". */
  defaultNsfwScope: "chat" | "user" | "world";
  /** Whether NSFW consent is required before encounters. Default true. */
  consentRequired: boolean;
  /** Whether to log NSFW gate decisions to audit trail. Default true. */
  auditLogging: boolean;
  /** HMAC secret for NSFW PII pseudonymization (gate audit + moderation reporter hash). Env-only: NSFW_PII_SECRET. Required in production. */
  piiSecret?: string;
  /** HMAC secret for moderation reporter-hash projection. Env-only: NSFW_FLAG_REPORTER_HASH_SECRET. Falls back to nsfw.piiSecret when unset. */
  reporterHashSecret?: string;
  /**
   * When true, the NSFW gate augments keyword detection with an LLM content
   * rating classifier (config-driven via `resolveSystemPrompt(templates, "nsfw")`).
   * On by default — the LLM classifier is the safety filter that detects and
   * censors extreme content (e.g. gruesome/graphic categories) the keyword pass
   * does not name. Disable only to trade detection depth for latency/LLM cost.
   * Default true.
   */
  useLlmClassifier: boolean;
}
