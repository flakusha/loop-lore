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
  refresh(): Promise<void>;
  _activeChatId(): string | null;
}

/**
 * Open (or re-open) the story-state stream for the host's current world.
 * Closes a previous stream first. No-op without a world or EventSource.
 * @param host component state
 * @returns {void}
 */
export function connectStoryStream(host: StoryStreamHost,): void {
  if (typeof EventSource === "undefined") { return; }
  const worldId = host._worldId;
  host._storyStream?.close();
  host._storyStream = null;
  if (!worldId) { return; }

  const source = new EventSource(`/api/v1/worlds/${worldId}/story-stream`,);
  host._storyStream = source;

  source.addEventListener("story-state", () => {
    // Stale-world guard: the story may have moved worlds since subscribing.
    if (host._worldId !== worldId) { return; }
    void host.refresh().catch((error: unknown,) => {
      log.warn("Story SSE refresh failed", { worldId, error, },);
    },);
  },);

  source.addEventListener("error", () => {
    if (typeof EventSource !== "undefined" && source.readyState === EventSource.CLOSED) {
      host._storyStream = null;
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
