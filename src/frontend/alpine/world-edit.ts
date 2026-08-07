import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";
import { log as rootLog, } from "./logger";
import { worldInvites, } from "./world-invites";
import { worldItems, } from "./world-items";
import { worldLocations, } from "./world-locations";

const log = rootLog.child({ module: "world-edit", },);

(globalThis as any).worldEditState = function() {
  return {
    worldId: "",
    activeTab: "general",
    world: { name: "", description: "", lore: "", kind: "rpg", visibility: "private", },
    tagsStr: "",
    loading: true,
    error: false,
    saving: false,
    ...worldInvites,
    ...worldLocations,
    ...worldItems,

    init() {
      const match = /\/worlds\/([\w-]+)\/edit/.exec(location.pathname,);
      if (match) { this.worldId = match[1] ?? null; }
      if (this.worldId) { this.loadWorld(); }
    },

    async loadWorld() {
      this.loading = true;
      this.error = false;
      try {
        const res = await apiFetch(`/api/worlds/${this.worldId}`, { headers: { Accept: "application/json", }, },);
        if (res.ok) {
          const data = await res.json();
          this.world = {
            name: data.name ?? "",
            description: data.description ?? "",
            lore: data.lore ?? "",
            kind: data.kind ?? "rpg",
            visibility: data.visibility ?? "private",
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
      const tags: string[] = [];
      if (this.tagsStr) {
        for (const t of this.tagsStr.split(",",)) {
          const trimmed = t.trim();
          if (trimmed) { tags.push(trimmed,); }
        }
      }
      const settings = this.tagsStr ? { tags, } : {};
      try {
        const res = await apiFetch(`/api/worlds/${this.worldId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ ...this.world, settings: jsonBody(settings,), },),
        },);
        if (res.ok) { showToast("success", t("toasts.worldSaved",),); }
        else {
          const err = await res.json();
          showToast("error", err.error || t("toasts.failedSaveWorld",),);
        }
      } catch {
        showToast("error", t("toasts.networkError",),);
      }
      this.saving = false;
    },

    async deleteWorld() {
      if (!confirm(t("worlds.deleteConfirm",),)) { return; }
      try {
        const res = await apiFetch(`/api/worlds/${this.worldId}`, { method: "DELETE", },);
        if (res.ok) {
          showToast("success", t("toasts.worldDeleted",),);
          location.assign("/worlds",);
        }
      } catch {
        showToast("error", t("toasts.failedDeleteWorld",),);
      }
    },
  };
};
