// ── Admin Page component (admin.html) ──────────────
import { log as rootLog } from "./logger";
import { jsonBody } from "./json";

const log = rootLog.child({ module: "admin" });

interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  status: string;
  created_at: string;
  last_seen_at: string | null;
}

interface AdminStats {
  users: number;
  chats: number;
  messages: number;
  characters: number;
  assets: number;
}

interface ProviderInfo {
  name: string;
  label: string;
  capabilities: {
    type: string;
    text: boolean;
    image: boolean;
    embeddings: boolean;
    streaming: boolean;
    tools: boolean;
    thinking: boolean;
  };
  status: string;
  modelCount: number;
  latencyMs?: number;
  lastChecked?: string;
  error?: string;
}

interface ModelRolesResponse {
  roles: Array<{
    role: string;
    provider: string;
    model: string;
    source: string;
  }>;
  overrides: Record<string, { provider: string; model: string }>;
  validRoles: string[];
}

(globalThis as any).adminPage = function () {
  return {
    activeTab: "users",
    stats: { users: 0, chats: 0, messages: 0, characters: 0, assets: 0 } as AdminStats,
    users: [] as UserRow[],
    userPage: 1,
    userTotal: 0,
    pageSize: 20,
    loadingUsers: false,
    loadingStats: false,
    confirmDeleteUser: "",
    editRoleUserId: "",
    editRoleValue: "",

    // Models tab state
    providers: [] as ProviderInfo[],
    providerModels: {} as Record<string, string[]>,
    modelRoles: {} as Record<string, { provider: string; model: string }>,
    overrides: {} as Record<string, { provider: string; model: string }>,
    loadingModels: false,
    scanning: false,
    expandProvider: "",

    async init() {
      await this.loadStats();
      await this.loadUsers();
    },

    async loadStats() {
      this.loadingStats = true;
      try {
        const res = await fetch("/api/admin/stats", { headers: { Accept: "application/json" } });
        if (res.ok) this.stats = await res.json();
        else log.warn("Failed to load admin stats");
      } catch {
        log.warn("Network error loading stats");
      } finally {
        this.loadingStats = false;
      }
    },

    async loadUsers() {
      this.loadingUsers = true;
      try {
        const res = await fetch(`/api/admin/users?page=${this.userPage}&pageSize=${this.pageSize}`, {
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          this.users = data.data || [];
          this.userTotal = data.total || 0;
        }
      } catch {
        log.warn("Network error loading users");
      } finally {
        this.loadingUsers = false;
      }
    },

    get userPages(): number {
      return Math.ceil(this.userTotal / this.pageSize) || 1;
    },

    async goUsersPage(p: number) {
      this.userPage = p;
      await this.loadUsers();
    },

    formatDate(iso: string | null): string {
      if (!iso) return "-";
      return new Date(iso).toLocaleDateString();
    },

    startEditRole(u: UserRow) {
      this.editRoleUserId = u.id;
      this.editRoleValue = u.role;
    },

    cancelEditRole() {
      this.editRoleUserId = "";
      this.editRoleValue = "";
    },

    async saveRole() {
      if (!this.editRoleUserId) return;
      try {
        const res = await apiFetch(`/api/admin/users/${this.editRoleUserId}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({ role: this.editRoleValue }),
        });
        if (res.ok) {
          showToast("success", "Role updated");
          this.cancelEditRole();
          await this.loadUsers();
        } else {
          const err = await res.json();
          showToast("error", err.error || "Failed to update role");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    async deleteUser(userId: string) {
      if (this.confirmDeleteUser !== userId) return;
      try {
        const res = await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("success", "User deleted");
          this.confirmDeleteUser = "";
          await this.loadUsers();
          await this.loadStats();
        } else {
          const err = await res.json();
          showToast("error", err.error || "Failed to delete user");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    // ── Models tab methods ──────────────────────────────────

    async loadModelsTab() {
      this.activeTab = "models";
      if (this.providers.length === 0) {
        await this.loadProviders();
      }
      await this.loadModelRoles();
    },

    async loadProviders() {
      this.loadingModels = true;
      try {
        const res = await fetch("/api/admin/providers", { headers: { Accept: "application/json" } });
        if (res.ok) {
          const data = await res.json();
          this.providers = data.providers || [];
          // Cache models for each provider
          for (const p of this.providers) {
            await this.loadProviderModels(p.name);
          }
        }
      } catch {
        log.warn("Network error loading providers");
      } finally {
        this.loadingModels = false;
      }
    },

    async loadProviderModels(name: string) {
      try {
        const res = await fetch(`/api/admin/providers/${name}/models`, {
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          this.providerModels[name] = data.models || [];
        }
      } catch {
        log.warn(`Failed to load models for ${name}`);
      }
    },

    async loadModelRoles() {
      try {
        const res = await fetch("/api/admin/model-roles", { headers: { Accept: "application/json" } });
        if (res.ok) {
          const data: ModelRolesResponse = await res.json();
          this.overrides = data.overrides || {};
          // Build modelRoles from resolved roles
          for (const r of data.roles) {
            this.modelRoles[r.role] = { provider: r.provider, model: r.model };
          }
        }
      } catch {
        log.warn("Failed to load model roles");
      }
    },

    getModelsForRole(role: string): string[] {
      const provider = this.modelRoles[role]?.provider;
      if (!provider) return [];
      return this.providerModels[provider] || [];
    },

    getProviderModels(name: string): string[] {
      return this.providerModels[name] || [];
    },

    get unhealthyProviders(): string[] {
      return this.providers.filter((p) => p.status !== "healthy").map((p) => p.label);
    },

    onRoleProviderChange(role: string, provider: string) {
      if (!Object.hasOwn(this.modelRoles, role)) {
        this.modelRoles[role] = { provider: "", model: "" };
      }
      this.modelRoles[role]!.provider = provider;
      this.modelRoles[role]!.model = "";
    },

    onRoleModelChange(role: string, model: string) {
      if (!Object.hasOwn(this.modelRoles, role)) {
        this.modelRoles[role] = { provider: "", model: "" };
      }
      this.modelRoles[role]!.model = model;
    },

    async saveModelRole(role: string) {
      const { provider, model } = this.modelRoles[role] || {};
      if (!provider || !model) return;
      try {
        const res = await apiFetch(`/api/admin/model-roles/${role}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({ provider, model }),
        });
        if (res.ok) {
          showToast("success", `${role} role updated`);
          await this.loadModelRoles();
        } else {
          const err = await res.json();
          showToast("error", err.error || "Failed to update role");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    async clearModelRole(role: string) {
      try {
        const res = await apiFetch(`/api/admin/model-roles/${role}`, { method: "DELETE" });
        if (res.ok) {
          showToast("success", `${role} role cleared`);
          await this.loadModelRoles();
        } else {
          const err = await res.json();
          showToast("error", err.error || "Failed to clear role");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    async rescanProviders() {
      this.scanning = true;
      try {
        const res = await apiFetch("/api/admin/providers/rescan", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          // Update provider statuses
          const providers = (data.providers ?? []) as ProviderInfo[];
          for (const p of providers) {
            const existing = this.providers.find((ep) => ep.name === p.name);
            if (existing) {
              existing.status = p.status;
              existing.modelCount = p.modelCount;
              existing.latencyMs = p.latencyMs;
              existing.error = p.error;
            }
            // Reload models for each provider
            await this.loadProviderModels(p.name);
          }
          showToast("success", "Providers rescanned");
        } else {
          showToast("error", "Failed to rescan providers");
        }
      } catch {
        showToast("error", "Network error");
      } finally {
        this.scanning = false;
      }
    },
  };
};
