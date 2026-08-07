import { AdminTemplateListResponse, } from "../../../validation/schemas/responses";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import { parseOr, } from "../validation";
import type { AdminTemplates, NewProfile, ProfileDetail, ProfileSummary, } from "./types";

const log = rootLog.child({ module: "admin-templates", },);

export const profiles = {
  // ── List state ──────────────────────────────────────
  templateProfiles: [] as ProfileSummary[],
  defaultProfileId: "sdxl",
  builtinCount: 0,
  customCount: 0,
  loadingTemplates: false,

  // ── Detail view state ───────────────────────────────
  selectedProfile: null as ProfileDetail | null,

  // ── Create modal state ──────────────────────────────
  showCreateModal: false,
  newProfile: {
    id: "",
    name: "",
    families: "",
    promptFormat: "tags",
    maxTokenHint: 150,
  } as NewProfile,

  // ── Data loading ────────────────────────────────────

  async loadTemplates() {
    this.loadingTemplates = true;
    try {
      const res = await apiFetch("/api/admin/templates", {
        headers: { Accept: "application/json", },
      },);
      if (res.ok) {
        const data = parseOr(AdminTemplateListResponse, await res.json(), {
          profiles: [],
          defaultProfileId: "sdxl",
          builtinCount: 0,
          customCount: 0,
        },);
        this.templateProfiles = data.profiles;
        this.defaultProfileId = data.defaultProfileId || "sdxl";
        this.builtinCount = data.builtinCount;
        this.customCount = data.customCount;
      }
    } catch {
      log.warn("Network error loading templates",);
    } finally {
      this.loadingTemplates = false;
    }
  },

  // ── Profile selection ───────────────────────────────

  async selectProfile(id: string,) {
    try {
      const res = await apiFetch(`/api/admin/templates/${id}`, {
        headers: { Accept: "application/json", },
      },);
      if (res.ok) {
        this.selectedProfile = await res.json();
      }
    } catch {
      log.warn(`Failed to load profile ${id}`,);
    }
  },

  clearSelection(this: AdminTemplates,) {
    this.selectedProfile = null;
    this.editingTemplate = null;
  },

  // ── Delete profile ──────────────────────────────────

  async deleteProfile(id: string,) {
    try {
      const res = await (globalThis as any).apiFetch(`/api/admin/templates/${id}`, {
        method: "DELETE",
      },);
      if (res.ok) {
        (globalThis as any).showToast("success", t("toasts.profileDeleted",),);
        await this.loadTemplates();
      } else {
        const err = await res.json();
        (globalThis as any).showToast("error", err.error || t("toasts.failedDelete",),);
      }
    } catch {
      (globalThis as any).showToast("error", t("toasts.networkError",),);
    }
  },

  // ── Create profile ──────────────────────────────────

  async createProfile() {
    const np = this.newProfile;
    if (!np.id || !np.name) { return; }
    try {
      const families: string[] = [];
      for (const s of np.families.split(",",)) {
        const trimmed = s.trim();
        if (trimmed) { families.push(trimmed,); }
      }
      const res = await (globalThis as any).apiFetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          id: np.id,
          name: np.name,
          families,
          promptFormat: np.promptFormat,
          maxTokenHint: np.maxTokenHint,
        },),
      },);
      if (res.ok) {
        (globalThis as any).showToast("success", t("toasts.profileCreated",),);
        this.showCreateModal = false;
        this.newProfile = {
          id: "",
          name: "",
          families: "",
          promptFormat: "tags",
          maxTokenHint: 150,
        };
        await this.loadTemplates();
      } else {
        const err = await res.json();
        (globalThis as any).showToast("error", err.error || t("toasts.failedCreate",),);
      }
    } catch {
      (globalThis as any).showToast("error", t("toasts.networkError",),);
    }
  },
};
