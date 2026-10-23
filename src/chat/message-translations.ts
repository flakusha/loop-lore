// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message translations — additive per-locale variant rows.
 *
 * The original message is ALWAYS the persisted `messages` row; every
 * translation (eager post-generation, rule-based reply, or on-demand POST)
 * becomes a `message_translations` variant row keyed
 * UNIQUE (message_id, locale). Failure semantics: the original is already
 * committed; a translation failure writes no row and never touches the
 * response — callers fire-and-forget with `.catch(logger.warn)`. A
 * translator pointing at an unregistered provider skips (never silently
 * re-routes to the general model). Translation is a post-store step only —
 * it never joins the content-hook gating chain.
 *
 * @module chat/message-translations
 */

import type { Kysely, } from "kysely";
import { runTranslate, } from "../assistant/commands/translate";
import type { Config, } from "../config/schema";
import { encryptMessageContent, getSmk, isEncryptionEnabled, } from "../crypto";
import { ContentEncoding, } from "../db/enums";
import type { DB, } from "../db/schema";
import { normalizeBcp47Tag, } from "../i18n/bcp47";
import { getLogger, } from "../logger";
import { buildTranslateDeps, normalizeTargetLang, shouldSkipTranslation, } from "./auto-translate";
import {
  resolveDisplayLocale,
  resolveEffectiveNativeLocale,
  shouldTriggerEagerTranslation,
} from "./translation-target";

/** Outcome of a translation attempt — `stored` false means no row was written. */
export interface TranslationOutcome {
  /** The LLM produced a usable translation (independent of persistence). */
  translated: boolean;
  /** A variant row was written/upserted. */
  stored: boolean;
  /** The resolved target locale (null when none could be resolved). */
  locale: string | null;
  /** Machine-readable skip/failure reason (undefined on full success). */
  reason?: string;
}

/** Inputs for {@link translateMessageToLocale}. */
export interface TranslateToLocaleOpts {
  messageId: string;
  chatId: string;
  /** Message author id (encryption derivation acts on this actor). */
  actorId: string;
  /** Requesting user id (provider/BYOK resolution). */
  userId: string;
  /** Plaintext source content (pre-encryption form). */
  plaintext: string;
  /** Target locale — validated against the shared catalog. */
  locale: string;
}

/**
 * Translate one message's plaintext into `locale` and upsert the variant
 * row. Expected failures are outcomes, never throws (unexpected DB errors
 * DO propagate — callers wrap fire-and-forget).
 * @param database
 * @param config
 * @param opts
 * @returns {Promise<TranslationOutcome>}
 */
export async function translateMessageToLocale(
  database: Kysely<DB>,
  config: Config,
  opts: TranslateToLocaleOpts,
): Promise<TranslationOutcome> {
  // Gate against the shared catalog AND canonicalize: BCP-47 normalization
  // is idempotent for catalog codes today and keeps stored rows canonical
  // once free-form tags open at the translation boundaries (upsert
  // idempotency must survive `en-us` vs `en-US`).
  const catalogLocale = normalizeTargetLang(opts.locale,);
  const locale = catalogLocale === null ? null : normalizeBcp47Tag(catalogLocale,);
  if (!locale) {
    return { translated: false, stored: false, locale: null, reason: "unknown-locale", };
  }

  // Provider-unregistered → skip + warn (buildTranslateDeps logs): never a
  // silent general-model substitution.
  const deps = await buildTranslateDeps(database, config, opts.userId,);
  if (!deps.complete) {
    return { translated: false, stored: false, locale, reason: "translator-unavailable", };
  }

  // Skip-only content inspection: the shared heuristic decides no-op
  // (empty/non-lexical text, or text already in the target script).
  if (shouldSkipTranslation(opts.plaintext, locale,)) {
    return { translated: false, stored: false, locale, reason: "skip-heuristic", };
  }

  const result = await runTranslate([locale, opts.plaintext,], { chatId: opts.chatId, }, deps,);
  const payload = result.actionPayload as { translated?: unknown; fallback?: unknown } | undefined;
  const translated = typeof payload?.translated === "string" ? payload.translated : "";
  if (payload?.fallback === true || !translated) {
    return { translated: false, stored: false, locale, reason: "translation-failed", };
  }

  // Encryption parity: mirror the messages content path exactly.
  let storedContent = translated;
  let keyId: string | null = null;
  let encoding: ContentEncoding = ContentEncoding.Identity;
  if (isEncryptionEnabled()) {
    const enc = await encryptMessageContent({
      database,
      chatId: opts.chatId,
      actorId: opts.actorId,
      plaintext: translated,
      smk: getSmk()!,
      pipeline: {
        threshold: config.encryption.compressThreshold,
        algorithm: config.encryption.compressAlgorithm,
      },
    },);

    storedContent = enc.storedContent;
    keyId = enc.keyId;
  }

  // UNIQUE (message_id, locale): retranslation is an idempotent upsert;
  // concurrent double-trigger collapses to one row.
  await database
    .insertInto("message_translations",)
    .values({
      message_id: opts.messageId,
      locale,
      content: storedContent,
      key_id: keyId,
      content_encoding: encoding,
      content_plaintext: translated,
      provider: deps.model ?? null,
      created_at: new Date().toISOString(),
    },)
    .onConflict((oc,) =>
      oc.columns(["message_id", "locale",],).doUpdateSet({
        content: storedContent,
        key_id: keyId,
        content_encoding: encoding,
        content_plaintext: translated,
        provider: deps.model ?? null,
        updated_at: new Date().toISOString(),
      },)
    )
    .execute();

  return { translated: true, stored: true, locale, };
}

/**
 * Hard-delete every translation variant row for one message.
 *
 * Called when the message's content is edited: rows are additive
 * retranslation caches, not history — the lazy/on-demand path regenerates
 * them, so an edit clears them instead of flagging staleness.
 * @param database
 * @param messageId
 * @returns {Promise<void>}
 */
export async function deleteMessageTranslations(
  database: Kysely<DB>,
  messageId: string,
): Promise<void> {
  await database
    .deleteFrom("message_translations",)
    .where("message_id", "=", messageId,)
    .execute();
}

/** Inputs for the eager post-store / rule-based-reply trigger. */
export interface TriggerTranslationOpts {
  messageId: string;
  chatId: string;
  actorId: string;
  userId: string;
  /** Plaintext content of the stored ORIGINAL message. */
  content: string;
  /** Provider/model the generation resolved to (post-store path). */
  provider?: string;
  model?: string;
}

/**
 * Eager trigger: translate the stored original when the resolved display
 * locale differs from the effective model native locale. Equal locale (or
 * no resolvable display preference) writes no row. Never throws.
 * @param database
 * @param config
 * @param opts
 * @returns {Promise<TranslationOutcome>}
 */
export async function triggerMessageTranslation(
  database: Kysely<DB>,
  config: Config,
  opts: TriggerTranslationOpts,
): Promise<TranslationOutcome> {
  const log = getLogger().child({ module: "message-translations", },);
  try {
    // Sequential awaits (lint: no Promise.all for DB reads).
    const chat = await database.selectFrom("chats",)
      .select(["gm_config", "story_state",],)
      .where("id", "=", opts.chatId,)
      .executeTakeFirst();

    const user = await database.selectFrom("users",)
      .select("settings",)
      .where("id", "=", opts.userId,)
      .executeTakeFirst();

    const displayLocale = resolveDisplayLocale({
      chatGmConfig: chat?.gm_config,
      chatStoryState: chat?.story_state,
      userSettings: user?.settings,
    },);

    const nativeLocale = await resolveEffectiveNativeLocale({
      db: database,
      config,
      provider: opts.provider ?? "",
      model: opts.model ?? "",
      chatGmConfig: chat?.gm_config,
      chatStoryState: chat?.story_state,
    },);

    if (displayLocale === null || !shouldTriggerEagerTranslation(displayLocale, nativeLocale,)) {
      return { translated: false, stored: false, locale: displayLocale, reason: "locale-matches-native", };
    }

    return await translateMessageToLocale(database, config, {
      messageId: opts.messageId,
      chatId: opts.chatId,
      actorId: opts.actorId,
      userId: opts.userId,
      plaintext: opts.content,
      locale: displayLocale,
    },);
  } catch (error) {
    // Fire-and-forget contract: surface, never propagate to the response.
    log.warn("Eager message translation failed", {
      chatId: opts.chatId,
      messageId: opts.messageId,
      error: error instanceof Error ? error.message : String(error,),
    },);

    return { translated: false, stored: false, locale: null, reason: "trigger-failed", };
  }
}
