import { jsonBody, jsonParseOr, } from "./json";
import { log as rootLog, } from "./logger";
import { worldLocations, } from "./world-locations";

const log = rootLog.child({ module: "world-edit", },);

(globalThis as any).worldEditState = function() {
  return {
    worldId: "",
    activeTab: "general",
    world: { name: "", description: "", lore: "", },
    tagsStr: "",
    loading: true,
    error: false,
    saving: false,
    ...worldLocations,

    init() {
      const match = /\/worlds\/([\w-]+)\/edit/.exec(location.pathname,);
      if (match) { this.worldId = match[1] ?? null; }
      if (this.worldId) { this.loadWorld(); }
    },

    async loadWorld() {
      this.loading = true;
      this.error = false;
      try {
        const res = await fetch(`/api/worlds/${this.worldId}`, { headers: { Accept: "application/json", }, },);
        if (res.ok) {
          const data = await res.json();
          this.world = {
            name: data.name ?? "",
            description: data.description ?? "",
            lore: data.lore ?? "",
          };
          if (data.settings) {
            const settings = jsonParseOr<{ tags?: string[] }>(data.settings, {},);
            this.tagsStr = (settings.tags || []).join(", ",);
          }
        } else { this.error = true; }
      } catch (error) {
        log.warn("loadWorld failed", { error: String(error,), },);
        this.error = true;
      }
      this.loading = false;
    },

    async saveWorld() {
      this.saving = true;
      const settings = this.tagsStr
        ? {
          tags: this.tagsStr
            .split(",",)
            .map((t: string,) => t.trim())
            .filter(Boolean,),
        }
        : {};
      try {
        const res = await fetch(`/api/worlds/${this.worldId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ ...this.world, settings: jsonBody(settings,), },),
        },);
        if (res.ok) { showToast("success", "World saved",); }
        else {
          const err = await res.json();
          showToast("error", err.error || "Failed to save",);
        }
      } catch {
        showToast("error", "Network error",);
      }
      this.saving = false;
    },

    async deleteWorld() {
      if (!confirm("Delete this world? All locations will be removed.",)) { return; }
      try {
        const res = await fetch(`/api/worlds/${this.worldId}`, { method: "DELETE", },);
        if (res.ok) {
          showToast("success", "World deleted",);
          location.assign("/worlds",);
        }
      } catch {
        showToast("error", "Failed to delete world",);
      }
    },
  };
};
