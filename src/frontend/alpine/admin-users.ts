import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "admin-users", },);

interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  status: string;
  created_at: string;
  last_seen_at: string | null;
}

export const adminUsers = {
  users: [] as UserRow[],
  userPage: 1,
  userTotal: 0,
  loadingUsers: false,
  confirmDeleteUser: "",
  editRoleUserId: "",
  editRoleValue: "",
  userSearch: "",
  userRoleFilter: "",
  userStatusFilter: "",

  async loadUsers() {
    this.loadingUsers = true;
    try {
      const self = this as any;
      let url = `/api/admin/users?page=${self.userPage}&pageSize=${self.pageSize}`;
      if (self.userSearch) { url += `&q=${encodeURIComponent(self.userSearch,)}`; }
      if (self.userRoleFilter) { url += `&role=${self.userRoleFilter}`; }
      if (self.userStatusFilter) { url += `&status=${self.userStatusFilter}`; }
      const res = await fetch(url, { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = await res.json();
        this.users = data.data || [];
        this.userTotal = data.total || 0;
      }
    } catch {
      log.warn("Network error loading users",);
    } finally {
      this.loadingUsers = false;
    }
  },
  get userPages(): number {
    return Math.ceil(this.userTotal / (this as any).pageSize,) || 1;
  },
  async goUsersPage(p: number,) {
    this.userPage = p;
    await this.loadUsers();
  },
  startEditRole(u: UserRow,) {
    this.editRoleUserId = u.id;
    this.editRoleValue = u.role;
  },
  cancelEditRole() {
    this.editRoleUserId = "";
    this.editRoleValue = "";
  },
  async saveRole() {
    if (!this.editRoleUserId) { return; }
    try {
      const res = await apiFetch(`/api/admin/users/${this.editRoleUserId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ role: this.editRoleValue, },),
      },);
      if (res.ok) {
        showToast("success", "Role updated",);
        this.cancelEditRole();
        await this.loadUsers();
      } else {
        const err = await res.json();
        showToast("error", err.error || "Failed",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },
  async deleteUser(userId: string,) {
    if (this.confirmDeleteUser !== userId) { return; }
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE", },);
      if (res.ok) {
        showToast("success", "User deleted",);
        this.confirmDeleteUser = "";
        await this.loadUsers();
        await (this as any).loadOverview();
      } else {
        const err = await res.json();
        showToast("error", err.error || "Failed",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },
  searchUsers() {
    this.userPage = 1;
    this.loadUsers();
  },
  clearUserFilters() {
    this.userSearch = "";
    this.userRoleFilter = "";
    this.userStatusFilter = "";
    this.userPage = 1;
    this.loadUsers();
  },
};
