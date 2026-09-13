// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-chat auto-translation layer.
 *
 * A chat opts in by storing a target language in its `chats.story_state`
 * JSON under {@link STORY_STATE_KEY} — no migration, no new column.
 * Empty/unset means off (explicit opt-out default). Translation runs
 * through the shared `/translate` pipeline (`runTranslate`); any failure
 * degrades to the untranslated original and never blocks send.
 *
 * Post-send hook points (wiring reported, not applied — registries owned
 * elsewhere): user inbound in `src/routes/messages/create.ts` after
 * `persistMentions`, assistant outbound in `src/routes/messages/reply.ts`
 * inside `maybeAutoReply` before the assistant row is inserted.
 *
 * @module chat/auto-translate
 */

import type { Kysely, } from "kysely";
import { LANGUAGES, runTranslate, type TranslateDeps, } from "../assistant/commands/translate";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { resolveProvider, } from "../generation/providers/registry";
import { safeJsonParse, safeJsonStringify, } from "../utils/safe-json";

/** `story_state` JSON key holding the per-chat translation target. */
export const STORY_STATE_KEY = "autoTranslateLang";

/** Cheap script probes — only ever used to SKIP translation, never to detect. */
const TARGET_SCRIPTS: Record<string, RegExp> = {
  ja: /[\u3040-\u309f\u30a0-\u30ff]/,
  zh: /[\u4e00-\u9fff]/,
  ko: /[\uac00-\ud7af\u1100-\u11ff]/,
  ru: /[\u0400-\u04ff]/,
  ar: /[\u0600-\u06ff]/,
};

/** Options for {@link autoTranslateText}. */
export interface AutoTranslateOptions {
  text: string;
  storyState: string | null | undefined;
  chatId: string;
  deps: TranslateDeps;
}

/** Outcome of {@link autoTranslateText} — `translated` false means `text` is the original. */
export interface AutoTranslateOutcome {
  text: string;
  translated: boolean;
  targetLang: string | null;
}

/**
 * Normalize a language code against the shared /translate catalog.
 * @param code
 */
export function normalizeTargetLang(code: string | null | undefined,): string | null {
  if (!code) { return null; }
  const lowered = code.toLowerCase();
  return LANGUAGES[lowered] ? lowered : null;
}

/**
 * Resolve the opt-in target language from a `story_state` JSON blob.
 * @param storyState
 */
export function resolveTargetLang(storyState: string | null | undefined,): string | null {
  if (!storyState) { return null; }
  const parsed = safeJsonParse<Record<string, unknown>>(storyState,);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) { return null; }
  const raw = parsed.value[STORY_STATE_KEY];
  return typeof raw === "string" ? normalizeTargetLang(raw,) : null;
}

/**
 * Merge a target language into a `story_state` JSON blob for persistence.
 * @param storyState
 * @param targetLang
 */
export function setChatTargetLang(
  storyState: string | null | undefined,
  targetLang: string | null | undefined,
): string | null {
  const normalized = normalizeTargetLang(targetLang,);
  const parsed = storyState ? safeJsonParse<Record<string, unknown>>(storyState,) : null;
  const current = parsed?.ok ? parsed.value : {};
  const next = { ...current, };
  if (normalized) {
    next[STORY_STATE_KEY] = normalized;
  } else {
    delete next[STORY_STATE_KEY];
  }
  const serialized = safeJsonStringify(next,);
  return serialized.ok ? serialized.value : (storyState ?? null);
}

/**
 * Cheap skip heuristic: true when translation would be a no-op.
 * @param text
 * @param targetLang
 */
export function shouldSkipTranslation(text: string, targetLang: string,): boolean {
  if (!text.trim()) { return true; }
  if (!/\p{L}/u.test(text,)) { return true; }
  const script = TARGET_SCRIPTS[targetLang];
  if (!script) { return false; }
  return script.test(text,) && !/[A-Za-z]/.test(text,);
}

/**
 * Translate text for a chat when it opted into a target language.
 * @param options
 */
export async function autoTranslateText(options: AutoTranslateOptions,): Promise<AutoTranslateOutcome> {
  const { text, storyState, chatId, deps, } = options;
  const targetLang = resolveTargetLang(storyState,);
  if (!targetLang) { return { text, translated: false, targetLang: null, }; }
  if (shouldSkipTranslation(text, targetLang,)) { return { text, translated: false, targetLang, }; }
  try {
    const result = await runTranslate([targetLang, text,], { chatId, }, deps,);
    const payload = result.actionPayload as { translated?: unknown; fallback?: unknown } | undefined;
    const translated = typeof payload?.translated === "string" ? payload.translated : "";
    if (payload?.fallback === true || !translated) { return { text, translated: false, targetLang, }; }
    return { text: translated, translated: true, targetLang, };
  } catch {
    // Degrade silently: the outcome already signals the failure
    // (`translated: false` + `targetLang`) for the caller to log — the
    // global logger may be uninitialized here and must never throw.
    return { text, translated: false, targetLang, };
  }
}

/**
 * Build `/translate` deps for route hooks: the resolved LLM `complete`, or
 * empty (heuristic-fallback path, which degrades to untranslated) when no
 * provider resolves. Never rejects.
 * @param database
 * @param config
 * @param userId
 */
export async function buildTranslateDeps(
  database: Kysely<DB>,
  config: Config,
  userId: string,
): Promise<TranslateDeps> {
  try {
    const resolved = await resolveProvider({ config, userId, db: database, },);
    return {
      complete: (req,) => resolved.provider.complete(req,),
      model: resolved.resolvedModel,
    };
  } catch {
    return {};
  }
}
