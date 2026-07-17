import { jsonBody } from "./json";
import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "world-locations" });

export const worldLocations = {
  locations: [] as any[],
  loadingLocations: false,
  locationsLoaded: false,
  showAddForm: false,
  newLocName: "",
  newLocDesc: "",
  newLocParentId: "",
  newLocConnections: [] as string[],
  editingLocationId: "",
  expandedLoc: "",
  editLocName: "",
  editLocDesc: "",

  async loadLocations() {
    const s = this as any;
    s.loadingLocations = true;
    s.locationsLoaded = false;
    try {
      const res = await fetch(`/api/worlds/${s.worldId}/locations`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        s.locations = (data.data || []).map((l: any) => ({
          ...l,
          connections: l.connections || [],
        }));
        s.locationsLoaded = true;
      }
    } catch (error) {
      log.warn("loadLocations failed", { error: String(error) });
    }
    s.loadingLocations = false;
  },

  async addLocation() {
    const s = this as any;
    if (!s.newLocName.trim()) return;
    try {
      const res = await fetch(`/api/worlds/${s.worldId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({
          name: s.newLocName,
          description: s.newLocDesc,
          parentLocationId: s.newLocParentId || null,
          connections: s.newLocConnections,
        }),
      });
      if (res.ok) {
        s.newLocName = "";
        s.newLocDesc = "";
        s.newLocParentId = "";
        s.newLocConnections = [];
        await s.loadLocations();
      } else {
        const err = await res.json();
        showToast("error", err.error || "Failed to add location");
      }
    } catch {
      showToast("error", "Network error");
    }
  },

  expandLoc(locId: string) {
    const s = this as any;
    if (s.expandedLoc === locId) {
      s.expandedLoc = "";
      return;
    }
    s.expandedLoc = locId;
    const loc = s.locations.find((l: any) => l.id === locId);
    if (loc) {
      s.editLocName = loc.name;
      s.editLocDesc = loc.description || "";
    }
  },

  async saveLocation(locId: string) {
    const s = this as any;
    try {
      const res = await fetch(`/api/worlds/${s.worldId}/locations/${locId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({
          name: s.editLocName.trim(),
          description: s.editLocDesc.trim() || null,
        }),
      });
      if (res.ok) {
        const loc = s.locations.find((l: any) => l.id === locId);
        if (loc) {
          loc.name = s.editLocName.trim();
          loc.description = s.editLocDesc.trim() || null;
        }
        s.expandedLoc = "";
        showToast("success", "Location updated");
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed");
      }
    } catch {
      showToast("error", "Network error");
    }
  },

  async deleteLocation(locId: string) {
    const s = this as any;
    if (!confirm("Delete this location?")) return;
    try {
      const res = await fetch(`/api/worlds/${s.worldId}/locations/${locId}`, { method: "DELETE" });
      if (res.ok) await s.loadLocations();
    } catch {
      showToast("error", "Failed to delete location");
    }
  },
};
