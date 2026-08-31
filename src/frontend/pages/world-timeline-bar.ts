// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World Timeline Bar — Alpine component for world-detail timeline branch selector.
 */
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
  switchTimeline(): Promise<void>;
  createTimeline(): Promise<void>;
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

    async init() {
      await this.loadTimelines();
    },

    async loadTimelines() {
      try {
        const res = await feFetch(`/api/worlds/${this.worldId}/timelines`,);
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

    async switchTimeline() {
      const tl = this.timelines.find((t,) => t.id === this.selectedTimeline);
      if (!tl) { return; }
      const detail = document.querySelector("#world-detail",);
      if (!detail) { return; }
      const url = `/dynamic/worlds/${this.worldId}/detail?timeline=` +
        `${encodeURIComponent(this.selectedTimeline,)}`;
      htmx.ajax("GET", url, { target: "#world-detail", swap: "innerHTML", },);
    },

    async createTimeline() {
      if (!this.newName.trim()) { return; }
      try {
        const res = await feFetch(`/api/worlds/${this.worldId}/timelines`, {
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
  };
}

(globalThis as unknown as Record<string, unknown>)["worldTimelineBar"] = worldTimelineBarImpl;

export type { WorldTimeline, WorldTimelineBarState, };
