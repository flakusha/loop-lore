// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-state SSE subscription (client half of the
 * TASK-clarify-story-state-sse-subscription-contract contract).
 *
 * Subscribes to `GET /api/v1/worlds/:worldId/story-stream` with an
 * EventSource; every `story-state` event triggers a `refresh()` so the
 * panel converges on the server snapshot. The subscription closes when
 * the world changes or the component tears down; `refresh()` remains the
 * offline fallback (no EventSource, closed stream, or undecodable frame
 * never blocks a manual load).
 *
 * One subscription per world: `connectStoryStream` keeps a live stream
 * for the current world instead of re-opening it, so the snapshot the
 * server replays on subscribe cannot feed an endless re-subscribe loop.
 *
 * Stale-chat guard: the stream belongs to one world. A frame arriving
 * after the story moved to another world is dropped; the component
 * re-subscribes on the next refresh instead.
 */

import { jsonParseOr, } from "../json";
import { log as rootLog, } from "../logger";
import type { StoryStateComponent, } from "./types";

const log = rootLog.child({ module: "story-state-stream", },);

/** Wire shape of the `story-state` SSE event (counts + watermarks only). */
export interface StoryStateStreamFrame {
  readonly worldStates: { count: number; updatedAt: string | null };
  readonly npcStates: { count: number; updatedAt: string | null };
  readonly locationStates: { count: number; updatedAt: string | null };
  readonly quests: { count: number; updatedAt: string | null };
}

const EMPTY_FRAME: StoryStateStreamFrame = {
  worldStates: { count: 0, updatedAt: null, },
  npcStates: { count: 0, updatedAt: null, },
  locationStates: { count: 0, updatedAt: null, },
  quests: { count: 0, updatedAt: null, },
};

/**
 * Decode a `story-state` frame; falls back to empty (no refresh) on drift.
 * @param raw event data
 * @returns {StoryStateStreamFrame}
 */
export function parseStoryStateFrame(raw: string,): StoryStateStreamFrame {
  const parsed = jsonParseOr<Partial<StoryStateStreamFrame>>(raw, EMPTY_FRAME,);
  if (parsed === EMPTY_FRAME || typeof parsed !== "object" || parsed === null) {
    return EMPTY_FRAME;
  }

  return { ...EMPTY_FRAME, ...parsed, };
}

/** Subscription callbacks owned by the story-state component. */
export interface StoryStreamHost {
  _worldId: string | null;
  _storyStream: EventSource | null;
  /** World the open subscription belongs to (null when offline). */
  _storyStreamWorldId: string | null;
  refresh(): Promise<void>;
  _activeChatId(): string | null;
}

/**
 * Ensure a live story-state subscription for the host's current world.
 *
 * Idempotent per world: an open stream for the SAME world is kept as-is.
 * Re-opening it per refresh would replay the server's connect-snapshot into
 * another refresh, and that refresh would open yet another stream — an
 * endless subscribe/reload loop. EventSource reconnects on its own and the
 * server replays the snapshot on subscribe, so a live stream never needs
 * re-opening; a changed world (or a dropped stream) does.
 * @param host component state
 * @returns {void}
 */
export function connectStoryStream(host: StoryStreamHost,): void {
  if (typeof EventSource === "undefined") { return; }
  const worldId = host._worldId;
  if (!worldId) {
    disconnectStoryStream(host,);
    return;
  }

  if (host._storyStream && host._storyStreamWorldId === worldId) { return; }
  disconnectStoryStream(host,);

  const source = new EventSource(`/api/v1/worlds/${worldId}/story-stream`,);
  host._storyStream = source;
  host._storyStreamWorldId = worldId;

  source.addEventListener("story-state", () => {
    // Stale-world guard: the story may have moved worlds since subscribing.
    if (host._worldId !== worldId) { return; }
    void host.refresh().catch((error: unknown,) => {
      log.warn("Story SSE refresh failed", { worldId, error, },);
    },);
  },);

  source.addEventListener("error", () => {
    if (typeof EventSource !== "undefined" && source.readyState === EventSource.CLOSED) {
      // A closed source is dead: drop it so the next refresh re-subscribes.
      if (host._storyStream !== source) { return; }
      host._storyStream = null;
      host._storyStreamWorldId = null;
    }
  },);
}

/**
 * Close the host's story-state stream (chat switch / teardown).
 * @param host component state
 * @returns {void}
 */
export function disconnectStoryStream(host: StoryStreamHost,): void {
  host._storyStream?.close();
  host._storyStream = null;
  host._storyStreamWorldId = null;
}

/** Mixin methods spread into the story-state component record. */
export const storyStream = {
  /**
   * @param {StoryStateComponent} this
   * @returns {void}
   */
  connectStoryStream(this: StoryStateComponent,): void {
    connectStoryStream(this,);
  },

  /**
   * @param {StoryStateComponent} this
   * @returns {void}
   */
  disconnectStoryStream(this: StoryStateComponent,): void {
    disconnectStoryStream(this,);
  },
};
