// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Variant resolution for `POST /api/chats`.
 *
 * A `variant` field pins the canonical `(type, mode, purpose)` triple from
 * `VARIANT_DEFAULTS`; any explicitly supplied component must agree with the
 * table, otherwise the request is rejected with a human-readable error.
 *
 * Only an *explicit* caller component is validated against the table. A chat
 * setup template's mode is a preset default rather than a caller choice, so
 * the variant wins over it instead of conflicting with it.
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
 * @returns Overrides to apply, or `error` when the variant/triple is invalid
 */
export function resolveVariantOverrides(
  rawBody: Record<string, unknown>,
  body: typeof ChatCreateBody.static,
  hasExplicit: (key: string,) => boolean,
): {
  resolvedType?: string;
  resolvedMode?: string;
  resolvedPurpose?: string;
  resolvedGmConfig?: Record<string, unknown>;
  resolvedMaxTurns?: number | null;
  resolvedAutoAdvance?: number | null;
  resolvedTalkativity?: number | null;
  resolvedPromptOverride?: string | null;
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
  const suppliedMode = hasExplicit("mode",) ? body.mode : undefined;
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
    resolvedPurpose: suppliedPurpose ?? def.chat_purpose,
    // Variant-derived gm_config seeds the row when the caller supplied none.
    resolvedGmConfig: !hasExplicit("gmConfig",) && def.gm_config !== null
      ? (def.gm_config as Record<string, unknown>)
      : undefined,
    // An absent key falls back to the variant default; an explicit `null`
    // means "no value" (e.g. no turn cap) and must survive the round trip,
    // so presence — not nullishness — decides.
    resolvedMaxTurns: hasExplicit("maxTurns",) ? (body.maxTurns ?? null) : def.max_turns,
    resolvedAutoAdvance: hasExplicit("autoAdvance",) ? (body.autoAdvance ?? null) : def.auto_advance,
    resolvedTalkativity: hasExplicit("talkativity",) ? (body.talkativity ?? null) : def.talkativity,
    resolvedPromptOverride: hasExplicit("promptOverride",)
      ? (body.promptOverride ?? null)
      : def.prompt_override_default,
  };
}
