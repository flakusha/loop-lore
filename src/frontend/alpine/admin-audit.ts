import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "admin-audit" });

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

export const adminAudit = {
  auditEntries: [] as AuditEntry[],
  auditPage: 1,
  auditTotal: 0,
  loadingAudit: false,
  auditEventType: "",
  auditEntityType: "",

  async loadAudit() {
    this.loadingAudit = true;
    try {
      let url = `/api/admin/audit?page=${this.auditPage}&pageSize=${(this as any).pageSize}`;
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
    return Math.ceil(this.auditTotal / (this as any).pageSize) || 1;
  },
  async goAuditPage(p: number) {
    this.auditPage = p;
    await this.loadAudit();
  },
};
