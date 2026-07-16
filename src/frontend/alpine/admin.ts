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
  worlds: number;
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
  roles: Array<{ role: string; provider: string; model: string; source: string }>;
  overrides: Record<string, { provider: string; model: string }>;
  validRoles: string[];
}

interface WorldRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}
interface ChatRow {
  id: string;
  name: string | null;
  type: string;
  is_pinned: string;
  world_id: string | null;
  created_at: string;
  updated_at: string;
}
interface AuditEntry {
  id: string;
  level: number;
  message: string;
  module: string | null;
  event_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}
interface PluginInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  origin: string;
  enabled: boolean;
  routeCount: number;
}
interface ConfigEntry {
  key: string;
  value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

(globalThis as any).adminPage = function () {
  return {
    // ── Shared state ────────────────────────────────────
    activeTab: "overview",
    tabsLoaded: {} as Record<string, boolean>,
    pageSize: 20,

    // Overview
    stats: { users: 0, chats: 0, messages: 0, characters: 0, assets: 0, worlds: 0 } as AdminStats,
    recentEntries: [] as AuditEntry[],

    // Users
    users: [] as UserRow[],
    userPage: 1,
    userTotal: 0,
    loadingUsers: false,
    confirmDeleteUser: "",
    editRoleUserId: "",
    editRoleValue: "",

    // Worlds
    worlds: [] as WorldRow[],
    worldPage: 1,
    worldTotal: 0,
    loadingWorlds: false,
    confirmDeleteWorld: "",

    // Chats
    adminChats: [] as ChatRow[],
    chatPage: 1,
    chatTotal: 0,
    loadingChats: false,
    confirmDeleteChat: "",

    // Audit
    auditEntries: [] as AuditEntry[],
    auditPage: 1,
    auditTotal: 0,
    loadingAudit: false,
    auditEventType: "",
    auditEntityType: "",

    // Models
    providers: [] as ProviderInfo[],
    providerModels: {} as Record<string, string[]>,
    modelRoles: {} as Record<string, { provider: string; model: string }>,
    overrides: {} as Record<string, { provider: string; model: string }>,
    loadingModels: false,
    scanning: false,
    expandProvider: "",

    // Plugins
    pluginList: [] as PluginInfo[],
    loadingPlugins: false,

    // System config
    systemConfig: [] as ConfigEntry[],
    sysConfigDirty: {} as Record<string, string>,
    loadingSystemConfig: false,

    // ── Lifecycle ───────────────────────────────────────
    async init() {
      await this.loadOverview();
    },

    showTab(tab: string) {
      this.activeTab = tab;
      if (this.tabsLoaded[tab]) return;
      this.tabsLoaded[tab] = true;
      switch (tab) {
        case "overview": {
          this.loadOverview();
          break;
        }
        case "users": {
          this.loadUsers();
          break;
        }
        case "worlds": {
          this.loadWorlds();
          break;
        }
        case "chats": {
          this.loadChats();
          break;
        }
        case "audit": {
          this.loadAudit();
          break;
        }
        case "models": {
          this.loadModels();
          this.loadModelRoles();
          break;
        }
        case "plugins": {
          this.loadPlugins();
          break;
        }
        case "system": {
          this.loadSystemConfig();
          break;
        }
      }
    },

    formatDate(iso: string | null): string {
      if (!iso) return "-";
      return new Date(iso).toLocaleDateString();
    },

    displayKey(key: string): string {
      return key.replaceAll("_", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
    },

    // ── Overview ────────────────────────────────────────
    async loadOverview() {
      try {
        const [statsRes, auditRes] = await Promise.all([
          fetch("/api/admin/stats", { headers: { Accept: "application/json" } }),
          fetch("/api/admin/audit?page=1&pageSize=10", { headers: { Accept: "application/json" } }),
        ]);
        if (statsRes.ok) this.stats = await statsRes.json();
        if (auditRes.ok) {
          const d = await auditRes.json();
          this.recentEntries = (d.data || []).slice(0, 10);
        }
      } catch {
        /* ignore */
      }
    },

    // ── Users ───────────────────────────────────────────
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
          showToast("error", err.error || "Failed");
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
          await this.loadOverview();
        } else {
          const err = await res.json();
          showToast("error", err.error || "Failed");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    // ── Worlds ──────────────────────────────────────────
    async loadWorlds() {
      this.loadingWorlds = true;
      try {
        const res = await fetch(`/api/admin/worlds?page=${this.worldPage}&pageSize=${this.pageSize}`, {
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          this.worlds = data.data || [];
          this.worldTotal = data.total || 0;
        }
      } catch {
        log.warn("Network error loading worlds");
      } finally {
        this.loadingWorlds = false;
      }
    },
    get worldPages(): number {
      return Math.ceil(this.worldTotal / this.pageSize) || 1;
    },
    async goWorldsPage(p: number) {
      this.worldPage = p;
      await this.loadWorlds();
    },
    async deleteWorld(worldId: string) {
      if (this.confirmDeleteWorld !== worldId) return;
      try {
        const res = await apiFetch(`/api/admin/worlds/${worldId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("success", "World deleted");
          this.confirmDeleteWorld = "";
          await this.loadWorlds();
          await this.loadOverview();
        } else {
          const err = await res.json();
          showToast("error", err.error || "Failed");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    // ── Chats ───────────────────────────────────────────
    async loadChats() {
      this.loadingChats = true;
      try {
        const res = await fetch(`/api/admin/chats?page=${this.chatPage}&pageSize=${this.pageSize}`, {
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          this.adminChats = data.data || [];
          this.chatTotal = data.total || 0;
        }
      } catch {
        log.warn("Network error loading chats");
      } finally {
        this.loadingChats = false;
      }
    },
    get chatPages(): number {
      return Math.ceil(this.chatTotal / this.pageSize) || 1;
    },
    async goChatsPage(p: number) {
      this.chatPage = p;
      await this.loadChats();
    },
    async deleteChat(chatId: string) {
      if (this.confirmDeleteChat !== chatId) return;
      try {
        const res = await apiFetch(`/api/admin/chats/${chatId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("success", "Chat deleted");
          this.confirmDeleteChat = "";
          await this.loadChats();
          await this.loadOverview();
        } else {
          const err = await res.json();
          showToast("error", err.error || "Failed");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    // ── Audit ───────────────────────────────────────────
    async loadAudit() {
      this.loadingAudit = true;
      try {
        let url = `/api/admin/audit?page=${this.auditPage}&pageSize=${this.pageSize}`;
        if (this.auditEventType) url += `&event_type=${this.auditEventType}`;
        if (this.auditEntityType) url += `&entity_type=${this.auditEntityType}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (res.ok) {
          const data = await res.json();
          this.auditEntries = data.data || [];
          this.auditTotal = data.total || 0;
        }
      } catch {
        log.warn("Network error loading audit");
      } finally {
        this.loadingAudit = false;
      }
    },
    get auditPages(): number {
      return Math.ceil(this.auditTotal / this.pageSize) || 1;
    },
    async goAuditPage(p: number) {
      this.auditPage = p;
      await this.loadAudit();
    },

    // ── Models ──────────────────────────────────────────
    async loadModels() {
      this.loadingModels = true;
      try {
        const res = await fetch("/api/admin/providers", { headers: { Accept: "application/json" } });
        if (res.ok) {
          const data = await res.json();
          this.providers = data.providers || [];
          for (const p of this.providers) await this.loadProviderModels(p.name);
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
          for (const r of data.roles) this.modelRoles[r.role] = { provider: r.provider, model: r.model };
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
    onRoleProviderChange(role: string, provider: string) {
      if (!Object.hasOwn(this.modelRoles, role)) this.modelRoles[role] = { provider: "", model: "" };
      this.modelRoles[role]!.provider = provider;
      this.modelRoles[role]!.model = "";
    },
    onRoleModelChange(role: string, model: string) {
      if (!Object.hasOwn(this.modelRoles, role)) this.modelRoles[role] = { provider: "", model: "" };
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
          showToast("error", err.error || "Failed");
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
          showToast("error", err.error || "Failed");
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
          const providers = (data.providers ?? []) as ProviderInfo[];
          for (const p of providers) {
            const existing = this.providers.find((ep: any) => ep.name === p.name);
            if (existing) {
              existing.status = p.status;
              existing.modelCount = p.modelCount;
              existing.latencyMs = p.latencyMs;
              existing.error = p.error;
            }
            await this.loadProviderModels(p.name);
          }
          showToast("success", "Providers rescanned");
        } else showToast("error", "Failed to rescan providers");
      } catch {
        showToast("error", "Network error");
      } finally {
        this.scanning = false;
      }
    },

    // ── Plugins ─────────────────────────────────────────
    async loadPlugins() {
      this.loadingPlugins = true;
      try {
        const res = await fetch("/api/plugins", { headers: { Accept: "application/json" } });
        if (res.ok) this.pluginList = await res.json();
      } catch {
        log.warn("Network error loading plugins");
      } finally {
        this.loadingPlugins = false;
      }
    },
    async togglePlugin(name: string, enable: boolean) {
      const action = enable ? "enable" : "disable";
      try {
        const res = await apiFetch(`/api/plugins/${name}/${action}`, { method: "POST" });
        if (res.ok) {
          showToast("success", `Plugin ${action}d`);
          await this.loadPlugins();
        } else {
          const err = await res.json();
          showToast("error", err.message || "Failed");
        }
      } catch {
        showToast("error", "Network error");
      }
    },

    // ── System config ───────────────────────────────────
    async loadSystemConfig() {
      this.loadingSystemConfig = true;
      try {
        const res = await fetch("/api/admin/system-config", { headers: { Accept: "application/json" } });
        if (res.ok) this.systemConfig = await res.json();
      } catch {
        log.warn("Network error loading system config");
      } finally {
        this.loadingSystemConfig = false;
      }
    },
    async saveSystemConfig(key: string) {
      const value = this.sysConfigDirty[key];
      if (value === undefined) return;
      try {
        const res = await apiFetch("/api/admin/system-config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: jsonBody({ key, value }),
        });
        if (res.ok) {
          showToast("success", "Config saved");
          delete this.sysConfigDirty[key];
          await this.loadSystemConfig();
        } else {
          const err = await res.json();
          showToast("error", err.message || "Failed");
        }
      } catch {
        showToast("error", "Network error");
      }
    },
  };
};
