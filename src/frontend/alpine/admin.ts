// ── Admin Page component (admin.html) ──────────────
import { log as rootLog } from "./logger";

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
          body: JSON.stringify({ role: this.editRoleValue }),
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
  };
};
