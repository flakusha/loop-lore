// ── Worlds page: search, create ──────────────────────────────
import { jsonBody } from "../alpine/json";
import { log as rootLog } from "../alpine/logger";
import { feFetch } from "../fe-fetch";
import { showToast } from "../ui";
import { filterCards } from "./shared";

const pageLog = rootLog.child({ module: "worlds" });

interface LocationData {
  id: string;
  name: string;
  description: string | null;
  world_id: string;
}

globalThis.filterWorlds = function() {
  const query = document.querySelector<HTMLInputElement>("#world-search")?.value ?? "";
  filterCards({
    containerId: "#world-list",
    cardSelector: ".world-card",
    nameSelector: ".world-name",
    descSelector: ".world-description",
    query,
    emptyIcon: "🌍",
    emptyTitle: "No worlds match your search",
  });
};

globalThis.createWorld = async function(event: Event) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  const data: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });
  pageLog.debug("createWorld", { data });
  try {
    const res = await feFetch("/api/worlds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonBody(data),
    });
    pageLog.debug("createWorld response", { status: res.status });
    if (res.ok) {
      const data = await res.json();
      document.querySelector("#create-world-modal")?.classList.remove("open");
      showToast("success", "World created");
      location.assign(`/worlds/${data.id}/edit`);
    } else {
      const err = await res.json();
      showToast("error", err.error || "Failed to create world");
    }
  } catch {
    showToast("error", "Network error");
  }
};

// ── World detail: location CRUD ─────────────────────────────
globalThis.worldDetail = function(initial: { worldId: string; locations: LocationData[] }) {
  return {
    worldId: initial.worldId,
    locations: initial.locations || [],
    showCreateLocation: false,
    newLocationName: "",
    newLocationDesc: "",
    expandedLoc: "",
    editLocName: "",
    editLocDesc: "",

    get locationCount(): number {
      return this.locations.length;
    },

    expandLoc(locId: string) {
      if (this.expandedLoc === locId) {
        this.expandedLoc = "";
        return;
      }
      this.expandedLoc = locId;
      const loc = this.locations.find((l: LocationData) => l.id === locId);
      if (loc) {
        this.editLocName = loc.name;
        this.editLocDesc = loc.description || "";
      }
    },

    async saveLocation(locId: string) {
      try {
        const res = await feFetch(`/api/worlds/${this.worldId}/locations/${locId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({
            name: this.editLocName.trim(),
            description: this.editLocDesc.trim() || null,
          }),
        });
        if (res.ok) {
          const loc = this.locations.find((l: LocationData) => l.id === locId);
          if (loc) {
            loc.name = this.editLocName.trim();
            loc.description = this.editLocDesc.trim() || null;
          }
          this.expandedLoc = "";
          showToast("success", "Location updated");
        } else {
          const err = await res.json();
          showToast("error", err.message || "Failed");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    async createLocation() {
      if (!this.newLocationName.trim()) return;
      try {
        const res = await feFetch(`/api/worlds/${this.worldId}/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({
            name: this.newLocationName.trim(),
            description: this.newLocationDesc.trim() || null,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          this.locations.push({
            id: data.id,
            name: this.newLocationName.trim(),
            description: this.newLocationDesc.trim() || null,
            world_id: this.worldId,
          });
          this.showCreateLocation = false;
          this.newLocationName = "";
          this.newLocationDesc = "";
          showToast("success", "Location created");
        } else {
          const err = await res.json();
          showToast("error", err.message || "Failed to create location");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    async deleteLocation(locId: string) {
      try {
        const res = await feFetch(`/api/worlds/${this.worldId}/locations/${locId}`, { method: "DELETE" });
        if (res.ok) {
          this.locations = this.locations.filter((l: LocationData) => l.id !== locId);
          showToast("success", "Location deleted");
        } else {
          const err = await res.json();
          showToast("error", err.message || "Failed");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    async initializeStates() {
      try {
        const res = await feFetch(`/api/worlds/${this.worldId}/initialize-states`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          showToast(
            "success",
            `Initialized ${data.locations_initialized} locations, ${data.npcs_initialized} NPCs`,
          );
        } else {
          showToast("error", "Failed to initialize states");
        }
      } catch {
        showToast("error", "Network error");
      }
    },
  };
};
