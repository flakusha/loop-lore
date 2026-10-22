// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { autoResize as autoResizeImpl, } from "./auto-resize";
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";
import { fetchWorldJson, } from "./world-fetch";
import { worldInvites, } from "./world-invites";
import { worldItems, } from "./world-items";
import { worldLocations, } from "./world-locations";

(globalThis as any).worldEditState = function() {
  return {
    worldId: "",
    activeTab: "general",
    world: {
      name: "",
      description: "",
      lore: "",
      kind: "rpg",
      visibility: "private",
      rpgEnabled: true,
      rpgXp: true,
      rpgSkills: true,
    },
    tagsStr: "",
    loading: true,
    error: false,
    saving: false,
    ...worldInvites,
    ...worldLocations,
    ...worldItems,

    /**
     * @returns {void}
     */
    init() {
      const match = /\/worlds\/([\w-]+)\/edit/.exec(location.pathname,);
      if (match) { this.worldId = match[1] ?? null; }
      if (this.worldId) { this.loadWorld(); }
    },

    /**
     * @returns {Promise<void>}
     */
    async loadWorld() {
      this.loading = true;
      this.error = false;
      try {
        const data = await fetchWorldJson<{
          name?: string;
          description?: string;
          lore?: string;
          kind?: "rpg" | "chat";
          visibility?: "private" | "unlisted" | "public";
          rpg_enabled?: number;
          rpg_xp?: number;
          rpg_skills?: number;
          settings?: string;
        }>(this.worldId, "",);

        if (data) {
          this.world = {
            name: data.name ?? "",
            description: data.description ?? "",
            lore: data.lore ?? "",
            kind: data.kind ?? "rpg",
            visibility: data.visibility ?? "private",
            rpgEnabled: (data.rpg_enabled ?? 0) === 1,
            rpgXp: (data.rpg_xp ?? 0) === 1,
            rpgSkills: (data.rpg_skills ?? 0) === 1,
          };

          if (data.settings) {
            const settings = jsonParseOr<{ tags?: string[] }>(data.settings, {},);
            this.tagsStr = (settings.tags || []).join(", ",);
          }
        } else { this.error = true; }
      } catch {
        this.error = true;
      }

      this.loading = false;
    },

    /**
     * @returns {Promise<void>}
     */
    async saveWorld() {
      this.saving = true;
      const tags: string[] = [];
      if (this.tagsStr) {
        for (const tagPart of this.tagsStr.split(",",)) {
          const trimmed = tagPart.trim();
          if (trimmed) { tags.push(trimmed,); }
        }
      }

      const settings = this.tagsStr ? { tags, } : {};
      try {
        const res = await apiFetch(`/api/v1/worlds/${this.worldId}`, {
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

    /**
     * @returns {Promise<void>}
     */
    async deleteWorld() {
      if (!confirm(t("worlds.deleteConfirm",),)) { return; }
      try {
        const res = await apiFetch(`/api/v1/worlds/${this.worldId}`, { method: "DELETE", },);
        if (res.ok) {
          showToast("success", t("toasts.worldDeleted",),);
          location.assign("/worlds",);
        }
      } catch {
        showToast("error", t("toasts.failedDeleteWorld",),);
      }
    },

    autoResize(el: HTMLTextAreaElement,) {
      autoResizeImpl(el,);
    },
  };
};
