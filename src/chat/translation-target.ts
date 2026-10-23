// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Translation target resolution — the ONE precedence module.
 *
 * Owns two chains (FEAT-language-selection-three-level +
 * FEAT-model-native-locale-config):
 *
 * 1. Display locale (what content the reader wants):
 *    message request param → chat `gm_config.contentLanguage`
 *    (read-through `story_state.autoTranslateLang` fallback) →
 *    user `settings.contentLocale` → UI locale → null.
 * 2. Effective model native locale (what the LLM generates natively):
 *    `model_capabilities.native_locale` → provider config `locale` →
 *    chat `contentLanguage` assumption → `en`.
 *
 * Eager translation fires only when the two differ. Callers must not
 * re-implement either chain (single-owner rule, mirrors translator-role).
 * Content language is NEVER auto-detected — `shouldSkipTranslation`
 * remains the only content inspector (skip-only).
 *
 * Known bottom-rung case (accepted, 2026-10-23): the rule-based reply path
 * (`src/routes/messages/reply.ts`) passes NO provider identity into the
 * eager trigger, so chain 2 bottoms out at chat `contentLanguage` → `en`
 * there — `native_locale`/provider `locale` are invisible on that path.
 *
 * @module chat/translation-target
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { normalizeBcp47Tag, } from "../i18n/bcp47";
import { isLocale, } from "../i18n/locale-registry";
import { safeJsonParse, safeJsonStringify, } from "../utils";
import { normalizeTargetLang, resolveTargetLang, } from "./auto-translate";

/** `gm_config` JSON key holding the single per-chat content-language field. */
export const CONTENT_LANGUAGE_KEY = "contentLanguage";

/** Locale assumed when nothing anywhere declares a native locale. */
export const DEFAULT_NATIVE_LOCALE = "en";

/** */
export interface DisplayLocaleInputs {
  /** Per-message request param (highest rung); unknown codes are ignored. */
  messageLocale?: string | null | undefined;
  /** Raw `chats.gm_config` JSON blob. */
  chatGmConfig: string | null | undefined;
  /** Raw `chats.story_state` JSON blob (read-through fallback source). */
  chatStoryState: string | null | undefined;
  /** Raw `users.settings` JSON blob. */
  userSettings: string | null | undefined;
  /** UI-locale value (cookie chain) — lowest preference rung. */
  uiLocale?: string | null | undefined;
}

/**
 * Read the chat content-language from a `gm_config` JSON blob, falling back
 * read-through to the shipped `story_state.autoTranslateLang` so existing
 * chats keep working without a data migration.
 * @param gmConfig - raw `chats.gm_config` value
 * @param storyState - raw `chats.story_state` value
 * @returns {string | null}
 */
export function readChatContentLanguage(
  gmConfig: string | null | undefined,
  storyState: string | null | undefined,
): string | null {
  if (gmConfig) {
    const parsed = safeJsonParse<Record<string, unknown>>(gmConfig,);
    const raw = parsed.ok ? parsed.value[CONTENT_LANGUAGE_KEY] : undefined;
    if (typeof raw === "string") {
      const normalized = normalizeTargetLang(raw,);
      if (normalized) { return normalized; }
    }
  }

  return resolveTargetLang(storyState,);
}

/**
 * Merge (or clear) the chat content-language key into a `gm_config` JSON
 * blob. The legacy `story_state.autoTranslateLang` is NOT touched here —
 * the alias endpoint clears it explicitly so the read-through fallback
 * never disagrees with the written value.
 * @param gmConfig - raw `chats.gm_config` value
 * @param locale - catalog locale code, or null/undefined to clear
 * @returns serialized gm_config, or the input when serialization fails
 */
export function setChatContentLanguage(
  gmConfig: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  const normalized = normalizeTargetLang(locale,);
  const parsed = gmConfig ? safeJsonParse<Record<string, unknown>>(gmConfig,) : null;
  const next = { ...(parsed?.ok ? parsed.value : {}), };
  if (normalized) {
    next[CONTENT_LANGUAGE_KEY] = normalized;
  } else {
    delete next[CONTENT_LANGUAGE_KEY];
  }

  const serialized = safeJsonStringify(next,);
  return serialized.ok ? serialized.value : (gmConfig ?? null);
}

/**
 * Read a well-formed BCP-47 locale (canonicalized) out of
 * `users.settings.contentLocale`. Free-form tags are accepted — the
 * 10-entry UI registry is authoritative only for UI-locale concerns.
 * @param userSettings - raw `users.settings` value
 * @returns {string | null}
 */
export function readUserContentLocale(userSettings: string | null | undefined,): string | null {
  if (!userSettings) { return null; }
  const parsed = safeJsonParse<Record<string, unknown>>(userSettings,);
  const raw = parsed.ok ? parsed.value["contentLocale"] : undefined;
  return typeof raw === "string" ? normalizeBcp47Tag(raw,) : null;
}

/**
 * Resolve the display locale — the single precedence chain for "which
 * language does the reader want". Unknown codes at any rung are skipped
 * (never fatal): validation-to-400 happens at HTTP boundaries, not here.
 * @param inputs - raw blobs plus optional message param / UI locale
 * @returns {string | null}
 */
export function resolveDisplayLocale(inputs: DisplayLocaleInputs,): string | null {
  // Translation rungs accept any well-formed BCP-47 tag (canonicalized);
  // only the UI-locale rung is gated on the 10-entry registry.
  const message = inputs.messageLocale
    ? normalizeBcp47Tag(inputs.messageLocale,)
    : null;

  if (message) { return message; }

  const chat = readChatContentLanguage(inputs.chatGmConfig, inputs.chatStoryState,);
  if (chat) { return chat; }

  const user = readUserContentLocale(inputs.userSettings,);
  if (user) { return user; }

  return inputs.uiLocale && isLocale(inputs.uiLocale,) ? inputs.uiLocale : null;
}

/** */
export interface NativeLocaleInputs {
  db: Kysely<DB>;
  config: Config;
  /** Provider name the generation/translation resolved to. */
  provider: string;
  /** Model id the generation/translation resolved to. */
  model: string;
  /** Raw `chats.gm_config` JSON blob (third rung assumption). */
  chatGmConfig: string | null | undefined;
  /** Raw `chats.story_state` JSON blob (read-through). */
  chatStoryState: string | null | undefined;
}

/**
 * Read the operator-declared `locale` off a provider instance config
 * (openaiCompatible / anthropic / ollamaNative lists and the Bedrock twin).
 * @param config
 * @param providerName
 * @returns {string | null}
 */
export function readProviderLocale(config: Config, providerName: string,): string | null {
  const providers = config.generation?.providers;
  if (!providers) { return null; }
  const instances = [
    ...(providers.openaiCompatible ?? []),
    ...(providers.anthropic ? [providers.anthropic,] : []),
    ...(providers.ollamaNative ? [providers.ollamaNative,] : []),
    ...(providers.bedrock ? [providers.bedrock,] : []),
  ];

  const match: { locale?: string } | undefined = instances.find(
    (p,) => p.name === providerName,
  );

  const locale = match?.locale;
  return typeof locale === "string" ? normalizeBcp47Tag(locale,) : null;
}

/**
 * Resolve the effective model native locale:
 * `model_capabilities.native_locale` → provider config `locale` → chat
 * `contentLanguage` assumption → `en`. Never throws — a DB read failure
 * just drops the first rung.
 * @param inputs - db, config, provider/model identity, chat blobs
 * @returns {Promise<string>}
 */
export async function resolveEffectiveNativeLocale(inputs: NativeLocaleInputs,): Promise<string> {
  try {
    const row = await inputs.db
      .selectFrom("model_capabilities",)
      .select("native_locale",)
      .where("provider_id", "=", inputs.provider,)
      .where("model_id", "=", inputs.model,)
      .executeTakeFirst();

    // Canonicalize: well-formed free-form tags are honored (models speak
    // more than the 10 UI-registry languages); malformed values drop the
    // rung and the chain falls through.
    if (row?.native_locale) {
      const canonical = normalizeBcp47Tag(row.native_locale,);
      if (canonical) { return canonical; }
    }
  } catch {
    // Discovery gap: no capabilities row / DB hiccup → fall through the chain.
  }

  const providerLocale = readProviderLocale(inputs.config, inputs.provider,);
  if (providerLocale) { return providerLocale; }

  return readChatContentLanguage(inputs.chatGmConfig, inputs.chatStoryState,) ??
    DEFAULT_NATIVE_LOCALE;
}

/**
 * Eager-trigger comparator: translation is eager only when the reader's
 * display locale differs from what the model produces natively.
 * @param displayLocale - resolved display locale (null = no preference)
 * @param nativeLocale - effective model native locale
 * @returns {boolean}
 */
export function shouldTriggerEagerTranslation(
  displayLocale: string | null,
  nativeLocale: string,
): boolean {
  return displayLocale !== null && displayLocale !== nativeLocale;
}
