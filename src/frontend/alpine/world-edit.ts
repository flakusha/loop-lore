// ── World Edit page component (world-edit.html) ──────────────

interface Location {
  id: string;
  name: string;
  description: string | null;
  parent_location_id: string | null;
}

interface World {
  id: string;
  name: string;
  description: string | null;
  lore: string | null;
  tags: string[];
}

globalThis.worldEditState = function () {
  return {
    // ── Core state ──
    loading: true,
    error: false,
    activeTab: "general",
    world: null as World | null,
    tagsStr: "",

    // ── Locations state ──
    locations: [] as Location[],
    locationsLoaded: false,
    loadingLocations: false,
    showAddForm: false,
    newLocName: "",
    newLocDesc: "",
    newLocParentId: "",

    get worldId(): string | null {
      const el = document.querySelector<HTMLElement>("#world-edit-form");
      return el?.dataset.worldId ?? null;
    },

    // ── Init (Alpine lifecycle) ──
    async init() {
      const id = this.worldId;
      if (!id) return;
      try {
        const res = await apiFetch(`/api/worlds/${id}`);
        if (!res.ok) {
          this.error = true;
          return;
        }
        const w = await res.json();
        this.world = {
          id: w.id,
          name: w.name,
          description: w.description,
          lore: w.lore,
          tags: w.tags || [],
        };
        this.tagsStr = (w.tags || []).join(", ");
      } catch {
        this.error = true;
      } finally {
        this.loading = false;
      }
    },

    // ── Save world ──
    async saveWorld() {
      const id = this.worldId;
      if (!id || !this.world) return;
      try {
        const body: Record<string, unknown> = {
          name: this.world.name,
        };
        if (this.world.description != null) body.description = this.world.description;
        if (this.world.lore != null) body.lore = this.world.lore;
        body.tags = this.tagsStr
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean);

        const res = await apiFetch(`/api/worlds/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          showToast("success", "World saved");
        } else {
          const err = await res.json();
          showToast("error", err.error || "Failed to save world");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    // ── Locations ──
    async loadLocations() {
      const id = this.worldId;
      if (!id) return;
      this.loadingLocations = true;
      try {
        const res = await apiFetch(`/api/worlds/${id}/locations?pageSize=100`);
        if (!res.ok) return;
        const data = await res.json();
        this.locations = data.data || [];
        this.locationsLoaded = true;
      } catch {
        /* ignore */
      } finally {
        this.loadingLocations = false;
      }
    },

    async addLocation() {
      const id = this.worldId;
      if (!id || !this.newLocName.trim()) return;
      const body: Record<string, unknown> = { name: this.newLocName.trim() };
      if (this.newLocDesc.trim()) body.description = this.newLocDesc.trim();
      if (this.newLocParentId) body.parentLocationId = this.newLocParentId;
      try {
        const res = await apiFetch(`/api/worlds/${id}/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          this.newLocName = "";
          this.newLocDesc = "";
          this.newLocParentId = "";
          this.showAddForm = false;
          await this.loadLocations();
          showToast("success", "Location added");
        } else {
          const err = await res.json();
          showToast("error", err.error || "Failed to add location");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    async deleteLocation(locId: string) {
      if (!confirm("Delete this location?")) return;
      const id = this.worldId;
      if (!id) return;
      try {
        const res = await apiFetch(`/api/worlds/${id}/locations/${locId}`, { method: "DELETE" });
        if (res.ok) {
          await this.loadLocations();
          showToast("success", "Location deleted");
        }
      } catch {
        showToast("error", "Network error");
      }
    },
  };
};
