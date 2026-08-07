import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { WorldEditState, } from "./world-types";

const log = rootLog.child({ module: "world-locations", },);

export const worldLocations: Partial<WorldEditState> & ThisType<WorldEditState> = {
  locations: [] as {
    id: string;
    name: string;
    description: string | null;
    parent_location_id: string | null;
  }[],
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
    this.loadingLocations = true;
    this.locationsLoaded = false;
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/locations`, {
        headers: { Accept: "application/json", },
      },);
      if (res.ok) {
        const data = await res.json();
        this.locations = Array.from(
          (data.data ?? []) as Array<{
            id: string;
            name: string;
            description: string | null;
            parent_location_id: string | null;
            connections?: unknown[];
          }>,
          (l,) => ({
            id: l.id,
            name: l.name,
            description: l.description,
            parent_location_id: l.parent_location_id,
            connections: l.connections || [],
          }),
        );
        this.locationsLoaded = true;
      }
    } catch (error) {
      log.warn("loadLocations failed", { error: String(error,), },);
    }
    this.loadingLocations = false;
  },

  async addLocation() {
    if (!this.newLocName.trim()) { return; }
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          name: this.newLocName,
          description: this.newLocDesc,
          parentLocationId: this.newLocParentId || null,
          connections: this.newLocConnections,
        },),
      },);
      if (res.ok) {
        this.newLocName = "";
        this.newLocDesc = "";
        this.newLocParentId = "";
        this.newLocConnections = [];
        await this.loadLocations();
      } else {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failedAddLocation",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },

  expandLoc(locId: string,) {
    if (this.expandedLoc === locId) {
      this.expandedLoc = "";
      return;
    }
    this.expandedLoc = locId;
    const loc = this.locations.find((l,) => l.id === locId);
    if (loc) {
      this.editLocName = loc.name;
      this.editLocDesc = loc.description || "";
    }
  },

  async saveLocation(locId: string,) {
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/locations/${locId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          name: this.editLocName.trim(),
          description: this.editLocDesc.trim() || null,
        },),
      },);
      if (res.ok) {
        const loc = this.locations.find((l,) => l.id === locId);
        if (loc) {
          loc.name = this.editLocName.trim();
          loc.description = this.editLocDesc.trim() || null;
        }
        this.expandedLoc = "";
        showToast("success", t("toasts.locationUpdated",),);
      } else {
        const err = await res.json();
        showToast("error", err.message || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },

  async deleteLocation(locId: string,) {
    if (!confirm(t("worlds.deleteLocationConfirm",),)) { return; }
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/locations/${locId}`, { method: "DELETE", },);
      if (res.ok) { await this.loadLocations(); }
    } catch {
      showToast("error", t("toasts.failedDeleteLocation",),);
    }
  },
};
