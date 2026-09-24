// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cascade pause watching + abort-signal plumbing
 * (BUG-cascade-mid-cascade-pause-ignores-abort).
 *
 * The pause toggle only writes `chats.story_state` — nothing pushes that
 * state into the generation layer — so the cascade polls the flag while a
 * depth's LLM call is in flight and translates `isPaused` into an abort.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";

/**
 * Read the `isPaused` flag from a chat's `story_state` JSON blob.
 * @param storyState - Raw `chats.story_state` value (null/undefined allowed)
 * @returns True only when the flag is exactly true
 */
export function storyStateIsPaused(storyState: string | null | undefined,): boolean {
  if (!storyState) { return false; }
  return jsonParseOr<{ isPaused?: boolean }>(storyState, {},).isPaused === true;
}

/** Tracking handle handed to callLlm (attempt id + live abort signal). */
export interface GenerationTracking {
  attemptId: string;
  abortSignal: AbortSignal;
}

/** Options for {@link watchChatPause}. */
export interface WatchChatPauseOpts {
  /** Active Kysely database. */
  database: Kysely<DB>;
  /** Chat whose pause flag is watched. */
  chatId: string;
  /** Poll interval in ms. */
  pollMs: number;
}

/**
 * Start a pause watcher for one in-flight cascade depth.
 *
 * While a depth's LLM call is in flight, poll `chats.story_state`; when the
 * user toggles pause, abort the returned cascade-scoped controller so the
 * provider call unwinds mid-flight instead of billing to completion.
 * @param opts - Options object
 * @param opts.database - Active Kysely database
 * @param opts.chatId - Chat whose pause flag is watched
 * @param opts.pollMs - Poll interval in ms
 * @returns The cascade-scoped AbortController (thread its signal into
 *   `triggerAutoGeneration({ abortSignal })`) and a `stop()` that clears
 *   the poll interval — call it when the depth settles.
 */
export function watchChatPause({ database, chatId, pollMs, }: WatchChatPauseOpts,): {
  controller: AbortController;
  stop: () => void;
} {
  const controller = new AbortController();
  const watcher = setInterval(() => {
    void database
      .selectFrom("chats",)
      .select("story_state",)
      .where("id", "=", chatId,)
      .executeTakeFirst()
      .then((row,) => {
        if (storyStateIsPaused(row?.story_state,)) {
          controller.abort("chat paused mid-cascade",);
        }
      },)
      .catch(() => {
        // Transient DB errors must not crash the cascade; the next tick retries.
      },);
  }, pollMs,);
  return {
    controller,
    stop: () => {
      clearInterval(watcher,);
    },
  };
}

/**
 * Combine the attempt's own abort signal with the caller-supplied one (the
 * cascade pause watcher) so EITHER can abort the in-flight LLM call
 * (BUG-cascade-mid-cascade-pause-ignores-abort). Without a caller signal
 * the tracking handle passes through unchanged. Ignored for initial
 * greetings, which have no generation tracking.
 * @param tracking - Tracking handle from prepareGeneration (undefined for greetings)
 * @param abortSignal - Caller-supplied cascade abort signal (optional)
 * @returns The tracking handle whose abortSignal covers both sources
 */
export function combineTrackingAbortSignal({
  tracking,
  abortSignal,
}: {
  tracking: GenerationTracking | undefined;
  abortSignal: AbortSignal | undefined;
},): GenerationTracking | undefined {
  if (!tracking || !abortSignal) { return tracking; }
  return {
    ...tracking,
    abortSignal: AbortSignal.any([tracking.abortSignal, abortSignal,],),
  };
}
