// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { AdminPaginatedEnvelope, AdminUserRow, } from "../../validation/schemas/responses";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import { parseOr, } from "./validation";

const log = rootLog.child({ module: "admin-users", },);

type UserRow = AdminUserRow;

const EMPTY_ADMIN_USERS = { data: [], total: 0, page: 1, pageSize: 50, };

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
      const res = await apiFetch(url, { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = parseOr(AdminPaginatedEnvelope(AdminUserRow,), await res.json(), EMPTY_ADMIN_USERS,);
        this.users = data.data;
        this.userTotal = data.total;
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
        showToast("success", t("toasts.roleUpdated",),);
        this.cancelEditRole();
        await this.loadUsers();
      } else {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },
  async deleteUser(userId: string,) {
    if (this.confirmDeleteUser !== userId) { return; }
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE", },);
      if (res.ok) {
        showToast("success", t("toasts.userDeleted",),);
        this.confirmDeleteUser = "";
        await this.loadUsers();
        await (this as any).loadOverview();
      } else {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
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
