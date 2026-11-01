// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW blur preference + click-to-reveal state (user preference, default OFF).
 *
 * The preference lives server-side in `nsfw_user_preferences.nsfw_blur_media`
 * (settings page writes it via the NSFW preferences API) and is mirrored to
 * localStorage under {@link NSFW_BLUR_STORAGE_KEY} — the same dual-persistence
 * convention as the chat display flags (`chat-inline-preview` et al). Render
 * paths read the mirror: chat Alpine state at init, server-rendered gallery
 * cards through the {@link nsfwBlurWanted} global at Alpine bind time.
 *
 * Reveal is a client-side toggle ONLY. Permission to view the content was
 * established before it was served (age gate, consent, moderation); revealing
 * re-checks nothing and needs no server round-trip.
 */
import { storageGet, } from "../../storage";

/** localStorage mirror key for the blur preference ("1" = blur on). */
export const NSFW_BLUR_STORAGE_KEY = "nsfw-blur-media";

/**
 * Whether the blur preference is currently on (mirror value "1"). Missing
 * key or unavailable storage answers false — the default is OFF, so every
 * failure mode degrades to today's unblurred render.
 * @returns {boolean} true when the user asked for NSFW media to be covered
 */
export function isNsfwBlurPrefOn(): boolean {
  return storageGet("local", NSFW_BLUR_STORAGE_KEY,) === "1";
}

/** Per-media revealed map (media key → revealed). Absent/false = still covered. */
export type NsfwRevealMap = Record<string, boolean>;

/**
 * Whether a media key is currently revealed.
 * @param revealed - the live reveal map
 * @param key - media key (attachment asset id, or `avatar-<messageId>`)
 * @returns {boolean} true when already revealed
 */
export function isNsfwRevealed(revealed: NsfwRevealMap, key: string,): boolean {
  return revealed[key] === true;
}

/**
 * Flip a media key's reveal state. Pure — returns a new map so Alpine
 * reactivity sees a fresh object.
 * @param revealed - the live reveal map
 * @param key - media key to toggle
 * @returns {NsfwRevealMap} the updated map (input untouched)
 */
export function toggleNsfwReveal(revealed: NsfwRevealMap, key: string,): NsfwRevealMap {
  const next: NsfwRevealMap = { ...revealed, };
  if (next[key]) {
    delete next[key];
  } else {
    next[key] = true;
  }

  return next;
}

/**
 * Whether an NSFW-flagged piece of media should render covered right now:
 * the preference must be on, the payload must flag the media NSFW, and the
 * item must not have been revealed yet.
 * @param params.nsfw - NSFW flag from the payload (undefined = not flagged)
 * @param params.blurEnabled - the user's blur preference (read at state init)
 * @param params.revealed - whether this item is already revealed
 * @returns {boolean} true when the media should render blurred/covered
 */
export function shouldBlurNsfw(
  { nsfw, blurEnabled, revealed, }: { nsfw?: boolean; blurEnabled: boolean; revealed: boolean },
): boolean {
  return blurEnabled && nsfw === true && !revealed;
}

/** Global registration for Alpine expressions outside the chatState scope
 * (server-rendered gallery cards bind `:class="{ 'nsfw-blur': nsfwBlurWanted() && !revealed }"`). */
declare global {
  var nsfwBlurWanted: () => boolean;
}

globalThis.nsfwBlurWanted = isNsfwBlurPrefOn;
