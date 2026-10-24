// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Secret-at-rest helpers for `system_config` rows.
 *
 * A secret-classified key (see `SECRET_KEY_PATTERN`) holds credential
 * material — API keys, tokens, DB URLs. Those values are stored in the
 * existing `secret:v1:` credential envelope (src/integrations/secrets.ts),
 * sealed under the repo SMK exactly like adapter credentials, and opened again
 * on read. The stored form is self-describing, so a row written before this
 * layer existed still reads back as plain text.
 */

import {
  resolveCredential,
  sealCredential,
  SECRET_REF_PREFIX,
  SecretEnvelopeError,
} from "../integrations/secrets";
import { getLogger, } from "../logger";
import { SECRET_KEY_PATTERN, } from "./config-keys";

/**
 * Whether a `system_config` key holds secret material.
 * @param key
 * @returns true when the key is secret-classified
 */
export function isSecretConfigKey(key: string,): boolean {
  return SECRET_KEY_PATTERN.test(key,);
}

/**
 * Seal a secret-classified value for storage.
 *
 * Non-secret keys and values that are already a `secret:` reference are
 * stored unchanged.
 * @param key
 * @param value
 * @returns the value to store
 * @throws {SecretEnvelopeError} When the value cannot be sealed — no key material is available.
 */
export async function sealConfigValue(key: string, value: string,): Promise<string> {
  if (!isSecretConfigKey(key,)) { return value; }
  if (value.startsWith(SECRET_REF_PREFIX,)) { return value; }

  try {
    return await sealCredential(value,);
  } catch (error) {
    if (!(error instanceof SecretEnvelopeError)) { throw error; }
    // Name the key, never the value.
    throw new SecretEnvelopeError(error.code, `cannot store secret config key "${key}": ${error.message}`,);
  }
}

/**
 * Open a stored value back to plain text.
 *
 * A legacy plain-text row passes through untouched; a `secret:` reference is
 * opened. A reference that cannot be opened keeps its stored form and warns —
 * a read must not fall over, and the ciphertext never leaves as plain text.
 * @param key
 * @param stored
 * @returns the plain-text value
 */
export async function openConfigValue(key: string, stored: string,): Promise<string> {
  if (!stored.startsWith(SECRET_REF_PREFIX,)) { return stored; }

  try {
    return await resolveCredential(stored,);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error,);
    warn("Cannot open sealed config value — returning the stored reference", { key, reason, },);
    return stored;
  }
}

/**
 * Warn through the structured logger when one is installed.
 * @param message
 * @param meta
 * @returns void
 */
function warn(message: string, meta: Record<string, unknown>,): void {
  try {
    getLogger().warn(message, meta,);
  } catch {
    // No root logger installed — the read still succeeds.
  }
}
