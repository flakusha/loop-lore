// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Keyphrase-triggered journal recall (TASK-KEYPHRASE-RECALL).
 *
 * Journal entries are actor memories whose `keywords` JSON array holds
 * trigger phrases (Kindroid-style, up to 8 per entry). This module is the
 * pure matching + per-chat cooldown half; the prompt-assembly hook lives in
 * `assistant/prompt/sections/memories-keyphrase.ts`.
 *
 * Matching is a case-insensitive substring test — reliable recall beats
 * precision here (the ticket's own guidance: use unique, non-generic
 * keyphrases). Cooldown state is process-local: one injection per
 * (chat, memory) within the TTL, so a repeated mention cannot flood the
 * prompt with the same entry on every turn.
 */

/** Max keyphrase-triggered recalls injected for one message (ticket default). */
export const DEFAULT_MAX_KEYPHRASE_RECALLS = 3;

/** Cooldown before the same entry may be keyphrase-recalled again in a chat. */
export const DEFAULT_KEYPHRASE_COOLDOWN_MS = 15 * 60 * 1000;

/** A journal entry candidate: id + its trigger phrases. */
export interface KeyphraseCandidate {
  id: string;
  keywords: string[];
}

/** Options for {@link findKeyphraseMatches}. */
export interface FindKeyphraseMatchesOpts {
  /** Lower-cased once — the message text to scan. */
  text: string;
  entries: readonly KeyphraseCandidate[];
  /** Cap on matches for this message. Defaults to 3; <= 0 returns []. */
  maxMatches?: number;
}

/** Options for the per-(chat, memory) cooldown helpers. */
export interface KeyphraseCooldownOpts {
  chatId: string;
  memoryId: string;
  /** Injectable clock (ms since epoch). Defaults to Date.now(). */
  now?: number;
  ttlMs?: number;
}

/** Cooldown ledger: `chatId\u0000memoryId` → last injection time (ms). */
const cooldowns = new Map<string, number>();

/** Bound the ledger so a long-running server cannot grow it without end. */
const MAX_COOLDOWN_ENTRIES = 5_000;

/**
 * @param opts
 * @returns map key for a (chat, memory) pair
 */
function cooldownKey(opts: KeyphraseCooldownOpts,): string {
  return `${opts.chatId}\u0000${opts.memoryId}`;
}

/**
 * Case-insensitive substring match of one keyphrase in the message text.
 * @param text - raw message text (any case)
 * @param phrase - the keyphrase (trimmed; empty never matches)
 * @returns whether the keyphrase appears in the text
 */
export function matchesKeyphrase(text: string, phrase: string,): boolean {
  const needle = phrase.trim().toLowerCase();
  if (needle === "") { return false; }
  return text.toLowerCase().includes(needle,);
}

/**
 * Scan entries for keyphrase hits against one message, capped at
 * `maxMatches` (per-message recall limit, ticket default 3).
 * @param opts
 * @returns matching entries in input order
 */
export function findKeyphraseMatches(opts: FindKeyphraseMatchesOpts,): KeyphraseCandidate[] {
  const max = opts.maxMatches ?? DEFAULT_MAX_KEYPHRASE_RECALLS;
  if (max <= 0) { return []; }
  const out: KeyphraseCandidate[] = [];
  for (const entry of opts.entries) {
    if (out.length >= max) { break; }
    if (entry.keywords.some((kw,) => matchesKeyphrase(opts.text, kw,))) {
      out.push(entry,);
    }
  }
  return out;
}

/**
 * @param opts
 * @returns true when this (chat, memory) pair is outside its cooldown window
 */
export function keyphraseRecallAllowed(opts: KeyphraseCooldownOpts,): boolean {
  const last = cooldowns.get(cooldownKey(opts,),);
  if (last === undefined) { return true; }
  const now = opts.now ?? Date.now();
  return now - last >= (opts.ttlMs ?? DEFAULT_KEYPHRASE_COOLDOWN_MS);
}

/**
 * Start the cooldown window for a (chat, memory) pair. Expired entries are
 * pruned opportunistically once the ledger crosses its bound.
 * @param opts
 */
export function recordKeyphraseRecall(opts: KeyphraseCooldownOpts,): void {
  if (cooldowns.size >= MAX_COOLDOWN_ENTRIES) {
    const now = opts.now ?? Date.now();
    const ttl = opts.ttlMs ?? DEFAULT_KEYPHRASE_COOLDOWN_MS;
    for (const [key, at,] of cooldowns) {
      if (now - at >= ttl) { cooldowns.delete(key,); }
    }
  }
  cooldowns.set(cooldownKey(opts,), opts.now ?? Date.now(),);
}

/** Clear all cooldown state (tests; also safe on config reload). */
export function clearKeyphraseRecallCooldowns(): void {
  cooldowns.clear();
}
