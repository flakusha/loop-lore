// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * system_config key classifiers — restart-required, per-chat overridable,
 * secret redaction. Pure constants, no DB access.
 */

import type { ConfigEntry, } from "./config";

/** Keys whose values must never leave the server in cleartext. */
export const SECRET_KEY_PATTERN =
  /secret|password|token|api.?key|private.?key|mesh.?psk|encryption.?key|signed.?url|db\.url|database.?url/iu;

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
