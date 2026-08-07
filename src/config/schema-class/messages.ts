// src/config/schema-class/messages.ts — messages section defaults
import type { MessagesConfig, } from "../schema";

export const MESSAGES_DEFAULTS = {
  autoHideInvalid: false,
  hideConfirmation: true,
  maxLength: 100_000,
  maxGenerationRetries: 3,
  generationTimeoutMs: 30_000,
  idempotencyExpiryHours: 24,
} satisfies MessagesConfig;
