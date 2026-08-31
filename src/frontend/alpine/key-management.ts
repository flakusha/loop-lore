// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Key Management UI Component
 *
 * Alpine.js component for managing encryption keys.
 * Renders in the settings modal under the "keys" tab.
 */

import { formatDisplayDate, } from "./chat-utils/time";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";

/** */
export interface ActorKeyMeta {
  id: string;
  actorId: string;
  name: string;
  keyType: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

(globalThis as any).keyManagement = function() {
  return {
    keys: [] as ActorKeyMeta[],
    loading: false,
    error: null as string | null,
    showGenerateModal: false,
    newKeyName: "",
    showRotateConfirm: false,
    showRevokeModal: false,
    revokeKeyId: null as string | null,
    revokeKeyName: "",

    async init() {
      await this.loadKeys();
    },

    async loadKeys() {
      this.loading = true;
      this.error = null;
      try {
        const res = await apiFetch("/api/keys", { headers: { Accept: "application/json", }, },);
        if (!res.ok) {
          throw new Error(t("crypto.keyLoadFailed",),);
        }
        const data = await res.json();
        this.keys = data.keys ?? [];
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("crypto.keyLoadFailed",);
      } finally {
        this.loading = false;
      }
    },

    async generateKey() {
      if (!this.newKeyName.trim()) { return; }

      this.loading = true;
      this.error = null;
      try {
        const res = await apiFetch("/api/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ name: this.newKeyName.trim(), },),
        },);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message ?? t("crypto.keyGenerateFailed",),);
        }
        this.showGenerateModal = false;
        this.newKeyName = "";
        await this.loadKeys();
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("crypto.keyGenerateFailed",);
      } finally {
        this.loading = false;
      }
    },

    async rotateKey() {
      this.loading = true;
      this.error = null;
      try {
        const res = await apiFetch("/api/keys/rotate", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
        },);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message ?? t("crypto.keyRotateFailed",),);
        }
        await this.loadKeys();
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("crypto.keyRotateFailed",);
      } finally {
        this.loading = false;
      }
    },

    confirmRevoke(key: ActorKeyMeta,) {
      this.revokeKeyId = key.id;
      this.revokeKeyName = key.name;
      this.showRevokeModal = true;
    },

    async revokeKey() {
      if (!this.revokeKeyId) { return; }

      this.loading = true;
      this.error = null;
      try {
        const res = await apiFetch(`/api/keys/${this.revokeKeyId}`, {
          method: "DELETE",
        },);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message ?? t("crypto.keyRevokeFailed",),);
        }
        this.showRevokeModal = false;
        this.revokeKeyId = null;
        this.revokeKeyName = "";
        await this.loadKeys();
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("crypto.keyRevokeFailed",);
      } finally {
        this.loading = false;
      }
    },

    formatDate(dateStr: string | null,): string {
      if (!dateStr) { return "—"; }
      return formatDisplayDate(dateStr, "datetime",);
    },

    statusColor(status: string,): string {
      switch (status) {
        case "active": {
          return "text-green-600 dark:text-green-400";
        }
        case "expired": {
          return "text-yellow-600 dark:text-yellow-400";
        }
        case "revoked": {
          return "text-red-600 dark:text-red-400";
        }
        default: {
          return "text-gray-600 dark:text-gray-400";
        }
      }
    },
  };
};
