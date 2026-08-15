import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { WorldEditState, } from "./world-types";

const log = rootLog.child({ module: "world-invites", },);

/**
 * One world invite row returned by GET /api/worlds/:worldId/invites.
 * Mirrors the backend `WorldInviteRow` in src/chat/world-invites.ts.
 */
export interface WorldInviteRow {
  id: string;
  worldId: string;
  code: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  status: string;
}

export const worldInvites: Partial<WorldEditState> & ThisType<WorldEditState> = {
  invites: [] as WorldInviteRow[],
  loadingInvites: false,
  invitesLoaded: false,
  newInviteMaxUses: "",
  showInviteForm: false,

  async loadInvites() {
    if (!this.worldId) { return; }
    this.loadingInvites = true;
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/invites`,);
      if (res.ok) {
        const body = await res.json();
        const rows = (body.data || []) as WorldInviteRow[];
        this.invites = rows;
        this.invitesLoaded = true;
      }
    } catch (error) {
      log.warn("loadInvites failed", { error: String(error,), },);
    }
    this.loadingInvites = false;
  },

  async createInvite() {
    if (!this.worldId) { return; }
    const trimmed = this.newInviteMaxUses.trim();
    const maxUses = trimmed ? Number(trimmed,) : null;
    if (maxUses !== null && (!Number.isInteger(maxUses,) || maxUses < 1)) {
      showToast("error", t("toasts.maxUsesPositiveInteger",),);
      return;
    }
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ maxUses, },),
      },);
      if (res.ok) {
        const invite = (await res.json()) as WorldInviteRow;
        this.invites = [invite, ...this.invites,];
        this.newInviteMaxUses = "";
        this.showInviteForm = false;
        await this.copyInviteCode(invite.code,);
        showToast("success", t("toasts.inviteCreatedAndCopied", { code: invite.code, },),);
      } else {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failedCreateInvite",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },

  async copyInviteCode(code: string,) {
    if (!navigator.clipboard) { return; }
    try {
      await navigator.clipboard.writeText(code,);
    } catch (error) {
      log.warn("copyInviteCode failed", { error: String(error,), },);
    }
  },

  async revokeInvite(inviteId: string,) {
    if (!this.worldId) { return; }
    const invite = this.invites.find((row,) => row.id === inviteId);
    if (!invite) { return; }
    if (!confirm(t("worlds.revokeInviteConfirm", { code: invite.code, },),)) { return; }
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/invites/${inviteId}`, {
        method: "DELETE",
      },);
      if (res.ok) {
        const remaining: WorldInviteRow[] = [];
        for (const row of this.invites) {
          if (row.id !== inviteId) { remaining.push(row,); }
        }
        this.invites = remaining;
        showToast("success", t("toasts.inviteRevoked",),);
      } else {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failedRevokeInvite",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },
};
