// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World Timeline Bar — Alpine component for world-detail timeline branch selector.
 */
import { autoResize as autoResizeImpl, } from "../alpine/auto-resize";
import { log as rootLog, } from "../alpine/logger";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";

const log = rootLog.child({ module: "world-timeline", },);

interface WorldTimeline {
  id: string;
  world_id: string;
  name: string;
  description: string | null;
  is_prime: number;
  created_at: string;
  /** Events recorded on this branch (world_timeline_events count). */
  eventCount: number;
}

interface WorldTimelineBarState {
  worldId: string;
  timelines: WorldTimeline[];
  selectedTimeline: string;
  showCreate: boolean;
  newName: string;
  newDesc: string;
  init(): Promise<void>;
  loadTimelines(): Promise<void>;
  /** Select a branch from the timeline list and re-scope the detail fragment. */
  selectTimeline(id: string,): void;
  switchTimeline(): Promise<void>;
  createTimeline(): Promise<void>;
  /** Resize a textarea to fit its content. */
  autoResize(el: HTMLTextAreaElement,): void;
}

/**
 * @param worldId
 */
function worldTimelineBarImpl(
  this: WorldTimelineBarState,
  worldId: string,
): WorldTimelineBarState {
  return {
    worldId,
    timelines: [],
    selectedTimeline: "",
    showCreate: false,
    newName: "",
    newDesc: "",

    /**
     * @returns {Promise<void>}
     */
    async init() {
      await this.loadTimelines();
    },

    /**
     * @returns {Promise<void>}
     */
    async loadTimelines() {
      try {
        const res = await feFetch(`/api/v1/worlds/${this.worldId}/timelines`,);
        if (res.ok) {
          const data = (await res.json()) as { data: WorldTimeline[] };
          this.timelines = data.data ?? [];
          if (!this.selectedTimeline) {
            const prime = this.timelines.find((t,) => t.is_prime);
            this.selectedTimeline = prime?.id ?? this.timelines[0]?.id ?? "";
          }
        }
      } catch (error) {
        log.warn("loadTimelines failed", { error: String(error,), },);
      }
    },

    /** Select a branch and re-scope the detail fragment to it. */
    selectTimeline(id: string,) {
      if (id === this.selectedTimeline) { return; }
      this.selectedTimeline = id;
      void this.switchTimeline();
    },

    /**
     * @returns {Promise<void>}
     */
    async switchTimeline() {
      const hasBranch = this.timelines.some((t,) => t.id === this.selectedTimeline);
      if (!hasBranch || !document.querySelector("#world-detail",)) { return; }
      const url = `/dynamic/worlds/${this.worldId}/detail?timeline=` +
        `${encodeURIComponent(this.selectedTimeline,)}`;

      // Fragment swap only — no full page reload: htmx.ajax targets the
      // #world-detail container and swaps its innerHTML.
      htmx.ajax("GET", url, { target: "#world-detail", swap: "innerHTML", },);
    },

    /**
     * @returns {Promise<void>}
     */
    async createTimeline() {
      if (!this.newName.trim()) { return; }
      try {
        const res = await feFetch(`/api/v1/worlds/${this.worldId}/timelines`, {
          method: "POST",
          /* eslint-disable no-restricted-syntax */
          body: JSON.stringify({
            name: this.newName.trim(),
            description: this.newDesc.trim() || undefined,
          },),
          /* eslint-enable no-restricted-syntax */
        },);

        if (res.ok) {
          const data = (await res.json()) as { data: WorldTimeline };
          this.timelines.push(data.data,);
          this.selectedTimeline = data.data.id;
          this.showCreate = false;
          this.newName = "";
          this.newDesc = "";
          showToast("success", "Timeline created",);
        } else {
          const err = (await res.json()) as { message?: string };
          showToast("error", err.message ?? "Failed to create timeline",);
        }
      } catch {
        showToast("error", "Network error",);
      }
    },

    autoResize(el: HTMLTextAreaElement,) {
      autoResizeImpl(el,);
    },
  };
}

(globalThis as unknown as Record<string, unknown>)["worldTimelineBar"] = worldTimelineBarImpl;

export type { WorldTimeline, WorldTimelineBarState, };
