// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * system_config key classifiers — restart-required, per-chat overridable,
 * secret redaction. Pure constants, no DB access.
 */

import { EDITABLE_SYSTEM_CONFIG_KEYS, } from "../config/sections/menu-data";
import { PROMPT_BUDGET_BOUNDS, } from "../config/sections/prompt";
import type { ConfigEntry, } from "./config";

/** Keys whose values must never leave the server in cleartext. */
export const SECRET_KEY_PATTERN =
  /secret|password|pass\b|token|api.?key|private.?key|mesh.?psk|encryption.?key|signed.?url|db\.url|database.?url/iu;

/** Flat keys and field names whose "token" is a budget unit, not a credential. */
const NON_SECRET_CONFIG_KEYS: ReadonlySet<string> = new Set([
  "lore_token_budget",
  "memory_token_budget",
  "loreTokenBudget",
  "memoryTokenBudget",
],);

/**
 * Secret classification with the two known prompt-budget keys excepted.
 * @param key - flat system_config key or camelCase field name
 * @returns true when the key holds credential material
 */
export function isSecretConfigKeyName(key: string,): boolean {
  return !NON_SECRET_CONFIG_KEYS.has(key,) && SECRET_KEY_PATTERN.test(key,);
}

/** Flat system_config keys whose values are prompt token budgets. */
const BUDGET_CONFIG_KEYS: ReadonlySet<string> = new Set([
  EDITABLE_SYSTEM_CONFIG_KEYS.loreTokenBudget,
  EDITABLE_SYSTEM_CONFIG_KEYS.memoryTokenBudget,
],);

/**
 * Validate an admin-editable config write. Only the two budget keys carry a
 * numeric/range rule; scenario and model_roles keep their consumer-side rules.
 * @param key - flat system_config key
 * @param raw - incoming value (string from either PATCH surface)
 * @returns stable error message, or null when the value is acceptable
 */
export function validateEditableConfigValue(key: string, raw: unknown,): string | null {
  if (!BUDGET_CONFIG_KEYS.has(key,)) { return null; }

  const budget = Number(raw,);
  if (
    !Number.isInteger(budget,) ||
    budget < PROMPT_BUDGET_BOUNDS.min ||
    budget > PROMPT_BUDGET_BOUNDS.max
  ) {
    return `Invalid ${key}: expected an integer between ${PROMPT_BUDGET_BOUNDS.min} and ${PROMPT_BUDGET_BOUNDS.max}`;
  }

  return null;
}

/**
 * Config keys whose modification requires a server restart to take effect.
 *
 * Touching any of these changes a binding (HTTP port, TLS cert, DB dialect,
 * provider registry, encryption-at-rest material). Live reload is impossible
 * without process replacement — admin UI surfaces a banner to make that
 * explicit.
 *
 * `Record<…, true>` form: static membership, no runtime mutation.
 */
export const REQUIRES_RESTART_KEYS: Readonly<Record<string, true>> = {
  // generation defaults — re-bind provider/model registry
  default_provider: true,
  default_model: true,
  // classifier template packs load once at config load; the fs watcher only
  // covers top-level config.<domain>.* files, so pack edits need a restart
  "templates.classifiers": true,
  // seeded backend bindings (see src/admin/config.ts seedDefaults)
  registration_open: true,
  session_timeout_hours: true,
  max_sessions_per_user: true,
  max_upload_size_bytes: true,
  log_retention_days: true,
  auto_moderation: true,
  profanity_filter: true,
  spam_detection: true,
  max_flags_before_hide: true,
};

/**
 * Config keys that moderators may override per chat from the chat settings modal.
 * Server defaults apply when a chat has no override. Mirrors the keys handled
 * in `src/frontend/alpine/chat-settings/gm-config-tuning.ts` plus model overrides.
 */
export const PER_CHAT_OVERRIDABLE_KEYS: Readonly<Record<string, true>> = {
  assistant_temperature: true,
  assistant_max_tokens: true,
  default_provider: true, // chat-level provider override
  default_model: true, // chat-level model override
  auto_moderation: true,
};

/**
 * Decorate a ConfigEntry with restart-required + per-chat overridable flags so
 * admin UIs can render badges without re-deriving the constant membership.
 * @param entry - Config row to decorate.
 * @returns The row plus `requires_restart` and `per_chat_overridable` flags.
 */
export function decorateConfigEntry<E extends ConfigEntry,>(
  entry: E,
): E & { requires_restart: boolean; per_chat_overridable: boolean } {
  return {
    ...entry,
    requires_restart: REQUIRES_RESTART_KEYS[entry.key] === true,
    per_chat_overridable: PER_CHAT_OVERRIDABLE_KEYS[entry.key] === true,
  };
}
