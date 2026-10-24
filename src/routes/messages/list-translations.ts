// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Read-time translation negotiation for the messages list endpoint
 * (FEAT-language-selection-three-level).
 *
 * Opt-in `?translateLocale=<locale|auto>`: the enricher batch-loads the
 * page's `message_translations` rows for the resolved locale (ONE `inArray`
 * select — no N+1) and attaches `{ translation: { locale, content } }` per
 * message where a row matches. Default payloads (no param) are unchanged.
 * `auto` resolves the requester's display locale through the ONE precedence
 * module (`resolveDisplayLocale` in chat/translation-target.ts).
 */
import type { Kysely, } from "kysely";
import { resolveDisplayLocale, } from "../../chat/translation-target";
import type { DB, } from "../../db/schema";
import { normalizeBcp47Tag, } from "../../i18n/bcp47";
import { getChildLogger, } from "../../logger";
import { resolveMessageContent, } from "./helpers";

/** Inputs for the `translateLocale=auto` display-locale resolution. */
export interface AutoLocaleInputs {
  chatId: string;
  userId: string;
  /** UI-locale value from the request's cookie/Accept-Language chain. */
  uiLocale?: string | null;
}

/**
 * Resolve the list-level display locale for `translateLocale=auto`: the
 * chat content-language → user contentLocale → UI-locale chain (no message
 * rung exists at list level).
 * @param database
 * @param inputs
 * @returns {Promise<string | null>} canonical display locale, or null when nothing resolves
 */
export async function resolveAutoDisplayLocale(
  database: Kysely<DB>,
  inputs: AutoLocaleInputs,
): Promise<string | null> {
  const chat = await database
    .selectFrom("chats",)
    .select(["gm_config", "story_state",],)
    .where("id", "=", inputs.chatId,)
    .executeTakeFirst();

  const user = await database
    .selectFrom("users",)
    .select("settings",)
    .where("id", "=", inputs.userId,)
    .executeTakeFirst();

  return resolveDisplayLocale({
    chatGmConfig: chat?.gm_config,
    chatStoryState: chat?.story_state,
    userSettings: user?.settings,
    uiLocale: inputs.uiLocale ?? null,
  },);
}

/**
 * Negotiate the requested translation locale and attach the matching
 * translation rows to a message list page.
 *
 * `requestedLocale` is the query value: an explicit locale, or `auto` to
 * resolve through the display-locale precedence chain. A negotiation or
 * lookup failure never costs the reader their page — it is logged and the
 * page is returned untranslated.
 * @param database
 * @param messages - enriched list rows (mutated in place)
 * @param inputs - chat/user context plus the requested locale
 * @returns {Promise<void>}
 */
export async function attachRequestedTranslations(
  database: Kysely<DB>,
  messages: Record<string, unknown>[],
  inputs: AutoLocaleInputs & { requestedLocale?: string | null },
): Promise<void> {
  if (!inputs.requestedLocale) { return; }
  try {
    const target = inputs.requestedLocale === "auto"
      ? await resolveAutoDisplayLocale(database, inputs,)
      : inputs.requestedLocale;

    if (target) { await attachMessageTranslations(database, messages, target,); }
  } catch (error) {
    getChildLogger("routes.messages.list-translations",)?.error(
      "Failed to attach message translations",
      error instanceof Error ? error : undefined,
      { chatId: inputs.chatId, },
    );
  }
}

/**
 * Batch-attach the translation matching `requestedLocale` to each message.
 * Rows are looked up with a single `inArray` select; decryption follows the
 * message-content path and a per-row failure degrades to the placeholder
 * (a translation problem never costs the reader their page).
 * @param database
 * @param messages - enriched list rows (mutated in place)
 * @param requestedLocale - explicit locale or the already-resolved `auto` value
 * @returns {Promise<void>}
 */
export async function attachMessageTranslations(
  database: Kysely<DB>,
  messages: Record<string, unknown>[],
  requestedLocale: string,
): Promise<void> {
  // Canonicalize BEFORE lookup so `en-us` finds a row stored as `en-US`.
  const locale = normalizeBcp47Tag(requestedLocale,);
  if (!locale || messages.length === 0) { return; }

  const ids = messages
    .map((message,) => message["id"])
    .filter((id,): id is string => typeof id === "string");

  if (ids.length === 0) { return; }

  const rows = await database
    .selectFrom("message_translations",)
    .selectAll()
    .where("message_id", "in", ids,)
    .where("locale", "=", locale,)
    .execute();

  if (rows.length === 0) { return; }
  const byMessageId = new Map(rows.map((row,) => [row.message_id, row,] as const),);

  for (const message of messages) {
    const row = byMessageId.get(message["id"] as string,);
    if (!row) { continue; }

    let content: string;
    try {
      content = await resolveMessageContent(database, {
        content: row.content,
        content_encoding: row.content_encoding,
        key_id: row.key_id,
        chat_id: message["chat_id"] as string,
      },);
    } catch {
      content = "[Encrypted — unable to decrypt]";
    }

    message["translation"] = { locale: row.locale, content, };
  }
}
