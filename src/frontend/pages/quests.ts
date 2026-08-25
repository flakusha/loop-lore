// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Quests Page component (quests.html)
import { formatDisplayDate, } from "../alpine/chat-utils/time";
import { jsonBody, } from "../alpine/json";
import { log as rootLog, } from "../alpine/logger";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";
import type { QuestRow, WorldOption, } from "./quests-parts";
import { getErrorMessage, } from "./shared";

const log = rootLog.child({ module: "quests", },);

globalThis.questsPage = function() {
  return {
    worldId: "",
    worldName: "",
    selectedWorldId: "",
    worldOptions: [] as WorldOption[],
    quests: [] as QuestRow[],
    loading: false,
    page: 1,
    pageSize: 20,
    total: 0,

    showCreateForm: false,
    createName: "",
    createDescription: "",
    createType: "collection",
    createCategory: "side",
    createPriority: 5,

    confirmDeleteQuest: "",

    get totalPages(): number {
      return Math.ceil(this.total / this.pageSize,) || 1;
    },

    async init() {
      const params = new URLSearchParams(globalThis.location.search,);
      this.worldId = params.get("worldId",) || "";

      if (this.worldId) {
        // Verify the world exists before rendering — a stale/deleted id
        // in the URL must not force a blank quests page.
        try {
          const wRes = await feFetch(`/api/worlds/${this.worldId}`, {
            headers: { Accept: "application/json", },
          },);
          if (!wRes.ok) {
            globalThis.location.assign("/views/quests",);
            return;
          }
        } catch {
          globalThis.location.assign("/views/quests",);
          return;
        }
        await this.loadQuests();
      } else {
        await this.loadWorlds();
      }
    },

    async loadWorlds() {
      try {
        const res = await feFetch("/api/worlds?pageSize=100", { headers: { Accept: "application/json", }, },);
        if (res.ok) {
          const data = await res.json();
          this.worldOptions = data.data || [];
        }
      } catch {
        log.warn("Failed to load worlds",);
      }
    },

    goToWorld(id: string,) {
      if (!id) { return; }
      globalThis.location.search = `?worldId=${id}`;
    },

    async loadQuests() {
      this.loading = true;
      try {
        const res = await feFetch(
          `/api/worlds/${this.worldId}/quests?page=${this.page}&pageSize=${this.pageSize}`,
          { headers: { Accept: "application/json", }, },
        );
        if (res.ok) {
          const data = await res.json();
          this.quests = data.data || [];
          this.total = data.total || 0;
        }
        if (!this.worldName) {
          const wRes = await feFetch(`/api/worlds/${this.worldId}`, {
            headers: { Accept: "application/json", },
          },);
          if (wRes.ok) {
            const wData = await wRes.json();
            this.worldName = wData.name || "";
          }
        }
      } catch {
        showToast("error", "Failed to load quests",);
      } finally {
        this.loading = false;
      }
    },

    async goPage(p: number,) {
      this.page = p;
      await this.loadQuests();
    },

    async createQuest() {
      if (!this.createName.trim()) { return; }
      try {
        const body: Record<string, unknown> = {
          name: this.createName.trim(),
          description: this.createDescription.trim() || "",
          type: this.createType,
          category: this.createCategory,
          priority: Number(this.createPriority,) || 5,
        };
        const res = await feFetch(`/api/worlds/${this.worldId}/quests`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody(body,),
        },);
        if (res.ok) {
          showToast("success", "Quest created",);
          this.showCreateForm = false;
          this.createName = "";
          this.createDescription = "";
          await this.loadQuests();
        } else {
          showToast("error", await getErrorMessage(res, "Failed to create quest",),);
        }
      } catch {
        showToast("error", "Network error",);
      }
    },

    async deleteQuest(questId: string,) {
      if (this.confirmDeleteQuest !== questId) { return; }
      try {
        const res = await feFetch(`/api/quests/${questId}`, { method: "DELETE", },);
        if (res.ok) {
          showToast("success", "Quest deleted",);
          this.confirmDeleteQuest = "";
          await this.loadQuests();
        } else {
          showToast("error", await getErrorMessage(res, "Failed to delete quest",),);
        }
      } catch {
        showToast("error", "Network error",);
      }
    },

    expandedQuest: "",
    editName: "",
    editDescription: "",
    editPriority: 5,
    advanceDelta: 1,

    formatDate(iso: string | null,): string {
      if (!iso) { return "-"; }
      return formatDisplayDate(iso, "date",);
    },

    progressPct(q: QuestRow,): number {
      if (!q.target || q.target <= 0) { return 0; }
      return Math.min(100, Math.round(((q.progress ?? 0) / q.target) * 100,),);
    },

    expandQuest(questId: string,) {
      if (this.expandedQuest === questId) {
        this.expandedQuest = "";
        return;
      }
      this.expandedQuest = questId;
      const q = this.quests.find((x: QuestRow,) => x.id === questId);
      if (q) {
        this.editName = q.name;
        this.editDescription = q.description || "";
        this.editPriority = q.priority;
      }
    },

    async saveQuest(questId: string,) {
      try {
        const res = await feFetch(`/api/quests/${questId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            name: this.editName.trim(),
            description: this.editDescription.trim() || null,
            priority: Number(this.editPriority,) || 5,
          },),
        },);
        if (res.ok) {
          showToast("success", "Quest updated",);
          this.expandedQuest = "";
          await this.loadQuests();
        } else {
          showToast("error", await getErrorMessage(res, "Failed",),);
        }
      } catch {
        showToast("error", "Network error",);
      }
    },

    async advanceQuest(questId: string,) {
      try {
        const res = await feFetch(`/api/quests/${questId}/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ delta: Number(this.advanceDelta,) || 1, },),
        },);
        if (res.ok) {
          const entry = await res.json();
          const q = this.quests.find((x: QuestRow,) => x.id === questId);
          if (q) { q.progress = entry.progress ?? (q.progress ?? 0) + (Number(this.advanceDelta,) || 1); }
          showToast("success", "Progress advanced",);
        } else {
          showToast("error", await getErrorMessage(res, "Failed",),);
        }
      } catch {
        showToast("error", "Network error",);
      }
    },
  };
};
