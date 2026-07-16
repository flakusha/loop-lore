/**
 * World Edit Alpine Component
 */
import { log as rootLog } from "./logger";
import { jsonBody } from "./json";

const log = rootLog.child({ module: "world-edit" });

(globalThis as any).worldEditState = function () {
  return {
    worldId: "",
    activeTab: "general",
    world: { name: "", description: "", lore: "" },
    tagsStr: "",
    loading: true,
    error: false,
    saving: false,
    locations: [],
    loadingLocations: false,
    locationsLoaded: false,
    showAddForm: false,
    newLocName: "",
    newLocDesc: "",
    newLocParentId: "",
    newLocConnections: [] as string[],
    editingLocationId: "",

    init() {
      const match = /\/worlds\/([\w-]+)\/edit/.exec(location.pathname);
      if (match) this.worldId = match[1];
      if (this.worldId) {
        this.loadWorld();
      }
    },

    async loadWorld() {
      this.loading = true;
      this.error = false;
      try {
        const res = await fetch(`/api/worlds/${this.worldId}`, { headers: { Accept: "application/json" } });
        if (res.ok) {
          const data = await res.json();
          this.world = {
            name: data.name ?? "",
            description: data.description ?? "",
            lore: data.lore ?? "",
          };
          if (data.settings) {
            try {
              const settings = JSON.parse(data.settings);
              this.tagsStr = (settings.tags || []).join(", ");
            } catch {}
          }
        } else {
          this.error = true;
        }
      } catch (error) {
        log.warn("loadWorld failed", { error: String(error) });
        this.error = true;
      }
      this.loading = false;
    },

    async saveWorld() {
      this.saving = true;
      const settings = this.tagsStr
        ? {
            tags: this.tagsStr
              .split(",")
              .map((t: string) => t.trim())
              .filter(Boolean),
          }
        : {};
      try {
        const res = await fetch(`/api/worlds/${this.worldId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({ ...this.world, settings: jsonBody(settings) }),
        });
        if (res.ok) {
          showToast("success", "World saved");
        } else {
          const err = await res.json();
          showToast("error", err.error || "Failed to save");
        }
      } catch {
        showToast("error", "Network error");
      }
      this.saving = false;
    },

    async loadLocations() {
      this.loadingLocations = true;
      this.locationsLoaded = false;
      try {
        const res = await fetch(`/api/worlds/${this.worldId}/locations`, {
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          this.locations = (data.data || []).map((l: any) => ({
            ...l,
            connections: l.connections || [],
          }));
          this.locationsLoaded = true;
        }
      } catch (error) {
        log.warn("loadLocations failed", { error: String(error) });
      }
      this.loadingLocations = false;
    },

    async addLocation() {
      if (!this.newLocName.trim()) return;
      try {
        const res = await fetch(`/api/worlds/${this.worldId}/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({
            name: this.newLocName,
            description: this.newLocDesc,
            parentLocationId: this.newLocParentId || null,
            connections: this.newLocConnections,
          }),
        });
        if (res.ok) {
          this.newLocName = "";
          this.newLocDesc = "";
          this.newLocParentId = "";
          this.newLocConnections = [];
          await this.loadLocations();
        } else {
          const err = await res.json();
          showToast("error", err.error || "Failed to add location");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    async editLocation(locId: string) {
      this.editingLocationId = locId;
      const res = await fetch(`/api/worlds/${this.worldId}/locations/${locId}`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        log.debug("editLocation loaded", { data });
      }
    },

    async deleteLocation(locId: string) {
      if (!confirm("Delete this location?")) return;
      try {
        const res = await fetch(`/api/worlds/${this.worldId}/locations/${locId}`, { method: "DELETE" });
        if (res.ok) {
          await this.loadLocations();
        }
      } catch {
        showToast("error", "Failed to delete location");
      }
    },

    async deleteWorld() {
      if (!confirm("Delete this world? All locations will be removed.")) return;
      try {
        const res = await fetch(`/api/worlds/${this.worldId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("success", "World deleted");
          location.assign("/worlds");
        }
      } catch {
        showToast("error", "Failed to delete world");
      }
    },
  };
};
