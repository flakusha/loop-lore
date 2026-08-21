// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Worlds page: search, create ──────────────────────────────
import { jsonBody, } from "../alpine/json";
import { log as rootLog, } from "../alpine/logger";
import { eventTarget, } from "../dom";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";
import { filterCards, } from "./shared";

const pageLog = rootLog.child({ module: "worlds", },);

interface LocationData {
  id: string;
  name: string;
  description: string | null;
  world_id: string;
}

globalThis.filterWorlds = function() {
  const query = document.querySelector<HTMLInputElement>("#world-search",)?.value ?? "";
  filterCards({
    containerId: "#world-list",
    cardSelector: ".world-card",
    nameSelector: ".world-name",
    descSelector: ".world-description",
    query,
    emptyIcon: "🌍",
    emptyTitle: "No worlds match your search",
  },);
};

globalThis.createWorld = async function(event: Event,) {
  event.preventDefault();
  const form = eventTarget<HTMLFormElement>(event,);
  if (!form) { return; }
  const formData = new FormData(form,);
  const data: Record<string, unknown> = {};
  formData.forEach((value, key,) => {
    data[key] = value;
  },);
  pageLog.debug("createWorld", { data, },);
  try {
    const res = await feFetch("/api/worlds", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(data,),
    },);
    pageLog.debug("createWorld response", { status: res.status, },);
    if (res.ok) {
      const data = await res.json();
      document.querySelector("#create-world-modal",)?.classList.remove("open",);
      showToast("success", "World created",);
      location.assign(`/worlds/${data.id}/edit`,);
    } else {
      const err = await res.json();
      showToast("error", err.error || "Failed to create world",);
    }
  } catch {
    showToast("error", "Network error",);
  }
};

// ── World detail: location CRUD ─────────────────────────────
interface ChatTemplateMeta {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  features: string[];
}

globalThis.worldDetail = function(initial: {
  worldId: string;
  locations: LocationData[];
  templates?: ChatTemplateMeta[];
},) {
  return {
    worldId: initial.worldId,
    locations: initial.locations || [],
    templates: initial.templates || [],
    newLocationTemplateId: "template-world",
    newLocationTemplateFeatures: [] as string[],
    showCreateLocation: false,
    newLocationName: "",
    newLocationDesc: "",
    expandedLoc: "",
    editLocName: "",
    editLocDesc: "",

    async init() {
      // Load chat setup templates (falls back to the seeded `world` default).
      if (this.templates.length === 0) {
        try {
          const res = await feFetch("/api/v1/chat-setup-templates",);
          if (res.ok) {
            const list = (await res.json()) as ChatTemplateMeta[];
            if (Array.isArray(list,)) { this.templates = list; }
          }
        } catch {
          /* ignore — default template still works server-side */
        }
      }
      this.newLocationTemplateId = this.templates.some((t,) => t.id === "template-world")
        ? "template-world"
        : (this.templates[0]?.id ?? "template-world");
      this.onTemplateChange();
    },

    onTemplateChange() {
      const t = this.templates.find((x,) => x.id === this.newLocationTemplateId);
      this.newLocationTemplateFeatures = t?.features ?? [];
    },

    get locationCount(): number {
      return this.locations.length;
    },

    expandLoc(locId: string,) {
      if (this.expandedLoc === locId) {
        this.expandedLoc = "";
        return;
      }
      this.expandedLoc = locId;
      const loc = this.locations.find((l: LocationData,) => l.id === locId);
      if (loc) {
        this.editLocName = loc.name;
        this.editLocDesc = loc.description || "";
      }
    },

    async saveLocation(locId: string,) {
      try {
        const res = await feFetch(`/api/worlds/${this.worldId}/locations/${locId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            name: this.editLocName.trim(),
            description: this.editLocDesc.trim() || null,
          },),
        },);
        if (res.ok) {
          const loc = this.locations.find((l: LocationData,) => l.id === locId);
          if (loc) {
            loc.name = this.editLocName.trim();
            loc.description = this.editLocDesc.trim() || null;
          }
          this.expandedLoc = "";
          showToast("success", "Location updated",);
        } else {
          const err = await res.json();
          showToast("error", err.message || "Failed",);
        }
      } catch {
        showToast("error", "Network error",);
      }
    },

    async createLocation() {
      if (!this.newLocationName.trim()) { return; }
      try {
        const res = await feFetch(`/api/worlds/${this.worldId}/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            name: this.newLocationName.trim(),
            description: this.newLocationDesc.trim() || null,
            templateId: this.newLocationTemplateId,
          },),
        },);
        if (res.ok) {
          const data = await res.json();
          this.locations.push({
            id: data.id,
            name: this.newLocationName.trim(),
            description: this.newLocationDesc.trim() || null,
            world_id: this.worldId,
          },);
          this.showCreateLocation = false;
          this.newLocationName = "";
          this.newLocationDesc = "";
          showToast("success", "Location created",);
        } else {
          const err = await res.json();
          showToast("error", err.message || "Failed to create location",);
        }
      } catch {
        showToast("error", "Network error",);
      }
    },

    async deleteLocation(locId: string,) {
      try {
        const res = await feFetch(`/api/worlds/${this.worldId}/locations/${locId}`, { method: "DELETE", },);
        if (res.ok) {
          const remaining: LocationData[] = [];
          for (const l of this.locations) {
            if (l.id !== locId) { remaining.push(l,); }
          }
          this.locations = remaining;
          showToast("success", "Location deleted",);
        } else {
          const err = await res.json();
          showToast("error", err.message || "Failed",);
        }
      } catch {
        showToast("error", "Network error",);
      }
    },

    async initializeStates() {
      try {
        const res = await feFetch(`/api/worlds/${this.worldId}/initialize-states`, { method: "POST", },);
        if (res.ok) {
          const data = await res.json();
          showToast(
            "success",
            `Initialized ${data.locations_initialized} locations, ${data.npcs_initialized} NPCs`,
          );
        } else {
          showToast("error", "Failed to initialize states",);
        }
      } catch {
        showToast("error", "Network error",);
      }
    },
  };
};

// ── World detail: timeline branch selector ───────────────────
interface WorldTimeline {
  id: string;
  world_id: string;
  name: string;
  description: string | null;
  is_prime: number;
  created_at: string;
}

globalThis.worldTimelineBar = function(worldId: string,) {
  return {
    worldId,
    timelines: [] as WorldTimeline[],
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
          // Default to prime timeline if none selected yet.
          if (!this.selectedTimeline) {
            const prime = this.timelines.find((t,) => t.is_prime);
            this.selectedTimeline = prime?.id ?? this.timelines[0]?.id ?? "";
          }
        }
      } catch (error) {
        pageLog.warn("loadTimelines failed", { error: String(error,), },);
      }
    },

    async switchTimeline() {
      const tl = this.timelines.find((t,) => t.id === this.selectedTimeline);
      if (!tl) { return; }
      // Persist the selected timeline on the world-detail reload.
      // The detail fragment re-queries world_timeline_events filtered by timeline_id.
      try {
        const detail = document.querySelector("#world-detail",);
        if (detail) {
          const url = `/dynamic/worlds/${this.worldId}/detail?timeline=${encodeURIComponent(this.selectedTimeline,)}`;
          htmx.ajax("GET", url, { target: "#world-detail", swap: "innerHTML", },);
        }
      } catch (error) {
        pageLog.warn("switchTimeline failed", { error: String(error,), },);
      }
    },

    async createTimeline() {
      if (!this.newName.trim()) { return; }
      try {
        const res = await feFetch(`/api/worlds/${this.worldId}/timelines`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ name: this.newName.trim(), description: this.newDesc.trim() || undefined, },),
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
};
