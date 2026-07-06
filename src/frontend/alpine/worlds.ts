// ── Worlds page component (worlds.html) ────────────────────

import { jsonBody } from "./json";

globalThis.worldsState = function () {
  return {
    worlds: [] as any[],
    loading: true,
    totalCount: 0,
    submitting: false,

    async init() {
      await this.loadWorlds();
    },

    async loadWorlds() {
      this.loading = true;
      try {
        const res = await apiFetch("/api/worlds?pageSize=100");
        if (!res.ok) {
          (this as any).$dispatch("show-toast", { type: "error", message: "Failed to load worlds" });
          return;
        }
        const data = await res.json();
        this.worlds = data.data || [];
        this.totalCount = data.pagination?.total || this.worlds.length;
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Failed to load worlds" });
      } finally {
        this.loading = false;
      }
    },

    selectWorld(world: any) {
      location.assign(`/worlds/${world.id}`);
    },

    async createWorld() {
      const root = (this as any).$el;
      const form = root?.tagName === "FORM" ? root : root?.querySelector("form");
      if (!form) return;

      this.submitting = true;
      const formData = new FormData(form);
      const data: Record<string, unknown> = {};
      formData.forEach((value, key) => {
        data[key] = value;
      });

      try {
        const res = await apiFetch("/api/worlds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: jsonBody(data),
        });
        if (res.ok) {
          globalThis.Alpine.store("ui").showCreateForm = false;
          (this as any).$dispatch("show-toast", { type: "success", message: "World created" });
          await this.loadWorlds();
        } else {
          const err = await res.json();
          (this as any).$dispatch("show-toast", {
            type: "error",
            message: err.error || "Failed to create world",
          });
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Network error" });
      } finally {
        this.submitting = false;
      }
    },
  };
};

// ── World Detail page component (world-detail.html) ──────

globalThis.worldDetailState = function () {
  return {
    world: null as any,
    loading: true,
    saving: false,

    async init() {
      const match = location.pathname.match(/\/worlds\/([\w-]+)/);
      if (match) {
        await this.loadWorld(match[1]);
        const titleEl = document.querySelector("#page-title");
        if (titleEl) titleEl.textContent = this.world?.name || "World";
      }
      document.addEventListener("refresh-world", () => {
        if (this.world?.id) this.loadWorld(this.world.id);
      });
    },

    async loadWorld(worldId: string) {
      this.loading = true;
      try {
        const res = await apiFetch(`/api/worlds/${worldId}`);
        if (res.ok) {
          this.world = await res.json();
          const titleEl = document.querySelector("#page-title");
          if (titleEl) titleEl.textContent = this.world?.name || "World";
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Failed to load world" });
      } finally {
        this.loading = false;
      }
    },

    async saveWorld() {
      if (!this.world?.id) return;
      this.saving = true;
      try {
        const res = await apiFetch(`/api/worlds/${this.world.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: jsonBody(this.world),
        });
        if (res.ok) {
          globalThis.Alpine.store("ui").showEditModal = false;
          (this as any).$dispatch("show-toast", { type: "success", message: "World saved" });
        } else {
          const err = await res.json();
          (this as any).$dispatch("show-toast", { type: "error", message: err.error || "Failed to save" });
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Network error" });
      } finally {
        this.saving = false;
      }
    },
  };
};

// ── World Edit page component (world-edit.html) ──────────

globalThis.worldEditState = function () {
  return {
    world: null as any,
    loading: true,
    saving: false,
    tagsInput: "",

    get tags() {
      return this.tagsInput
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean);
    },

    async init() {
      const match = location.pathname.match(/\/worlds\/([\w-]+)\/edit/);
      if (match) {
        await this.loadWorld(match[1]);
      }
    },

    async loadWorld(worldId: string) {
      this.loading = true;
      try {
        const res = await apiFetch(`/api/worlds/${worldId}`);
        if (res.ok) {
          this.world = await res.json();
          this.tagsInput = (this.world.tags || []).join(", ");
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Failed to load world" });
      } finally {
        this.loading = false;
      }
    },

    removeTag(tag: string) {
      this.tagsInput = this.tagsInput
        .split(",")
        .filter((t: string) => t.trim() !== tag)
        .join(", ");
    },

    async saveWorld() {
      if (!this.world?.id) return;
      this.saving = true;
      try {
        const data = { ...this.world, tags: this.tags };
        const res = await apiFetch(`/api/worlds/${this.world.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: jsonBody(data),
        });
        if (res.ok) {
          (this as any).$dispatch("show-toast", { type: "success", message: "World saved" });
          history.back();
        } else {
          const err = await res.json();
          (this as any).$dispatch("show-toast", { type: "error", message: err.error || "Failed to save" });
        }
      } catch {
        (this as any).$dispatch("show-toast", { type: "error", message: "Network error" });
      } finally {
        this.saving = false;
      }
    },
  };
};
