// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Variant resolution for `POST /api/chats`.
 *
 * A `variant` field pins the canonical `(type, mode, purpose)` triple from
 * `VARIANT_DEFAULTS`; any explicitly supplied component must agree with the
 * table, otherwise the request is rejected with a human-readable error.
 */
import {
  CHAT_VARIANTS,
  type ChatVariant,
  validateVariantTriple,
  VARIANT_DEFAULTS,
} from "../../chat/types/variants";
import { ChatCreateBody, } from "../../validation/schemas";

/**
 * @param rawBody - Raw body (distinguishes absent keys from defaults)
 * @param body - Validated body
 * @param hasExplicit - Whether a key was present in the raw body
 * @param templateMode - Mode inherited from a chat setup template
 * @returns Overrides to apply, or `error` when the variant/triple is invalid
 */
export function resolveVariantOverrides(
  rawBody: Record<string, unknown>,
  body: typeof ChatCreateBody.static,
  hasExplicit: (key: string,) => boolean,
  templateMode: string | undefined,
): {
  resolvedType?: string;
  resolvedMode?: string;
  resolvedGmConfig?: Record<string, unknown>;
  error?: string;
} {
  const rawVariant = rawBody.variant as string | undefined;
  if (rawVariant === undefined) { return {}; }
  if (!(CHAT_VARIANTS as readonly string[]).includes(rawVariant,)) {
    return { error: `Unknown chat variant: ${rawVariant}`, };
  }
  const variant = rawVariant as ChatVariant;
  const def = VARIANT_DEFAULTS[variant];
  // If the caller also supplies any of type/mode/purpose, they must match the
  // variant table; otherwise the variant default applies.
  const suppliedType = hasExplicit("type",) ? body.type : undefined;
  const suppliedMode = hasExplicit("mode",) ? body.mode : templateMode;
  const suppliedPurpose = hasExplicit("purpose",) ? (rawBody.purpose as string) : undefined;
  if (suppliedType !== undefined || suppliedMode !== undefined || suppliedPurpose !== undefined) {
    const err = validateVariantTriple(
      variant,
      suppliedType ?? def.chat_type,
      suppliedMode ?? def.chat_mode,
      suppliedPurpose ?? def.chat_purpose,
    );
    if (err) { return { error: err, }; }
  }
  return {
    resolvedType: suppliedType ?? def.chat_type,
    resolvedMode: suppliedMode ?? def.chat_mode,
    // Variant-derived gm_config seeds the row when the caller supplied none.
    resolvedGmConfig: !hasExplicit("gmConfig",) && def.gm_config !== null
      ? (def.gm_config as Record<string, unknown>)
      : undefined,
  };
}
