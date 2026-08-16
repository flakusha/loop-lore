// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { AdminAuditRow, AdminPaginatedEnvelope, } from "../../validation/schemas/responses";
import { log as rootLog, } from "./logger";
import { parseOr, } from "./validation";

const log = rootLog.child({ module: "admin-audit", },);

type AuditEntry = AdminAuditRow;

const EMPTY_ADMIN_AUDIT = { data: [], total: 0, page: 1, pageSize: 50, };

export const adminAudit = {
  auditEntries: [] as AuditEntry[],
  auditPage: 1,
  auditTotal: 0,
  loadingAudit: false,
  auditEventType: "",
  auditEntityType: "",
  auditSearch: "",

  async loadAudit() {
    this.loadingAudit = true;
    try {
      let url = `/api/admin/audit?page=${this.auditPage}&pageSize=${(this as any).pageSize}`;
      if (this.auditEventType) { url += `&event_type=${this.auditEventType}`; }
      if (this.auditEntityType) { url += `&entity_type=${this.auditEntityType}`; }
      if (this.auditSearch) { url += `&q=${encodeURIComponent(this.auditSearch,)}`; }
      const res = await apiFetch(url, { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = parseOr(AdminPaginatedEnvelope(AdminAuditRow,), await res.json(), EMPTY_ADMIN_AUDIT,);
        this.auditEntries = data.data;
        this.auditTotal = data.total;
      }
    } catch {
      log.warn("Network error loading audit",);
    } finally {
      this.loadingAudit = false;
    }
  },
  get auditPages(): number {
    return Math.ceil(this.auditTotal / (this as any).pageSize,) || 1;
  },
  async goAuditPage(p: number,) {
    this.auditPage = p;
    await this.loadAudit();
  },
  searchAudit() {
    this.auditPage = 1;
    this.loadAudit();
  },
  clearAuditFilters() {
    this.auditSearch = "";
    this.auditEventType = "";
    this.auditEntityType = "";
    this.auditPage = 1;
    this.loadAudit();
  },
};
