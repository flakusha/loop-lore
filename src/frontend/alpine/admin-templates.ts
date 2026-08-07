import { AdminTemplateListResponse, } from "../../validation/schemas/responses";
import type { ProfileSummary as ProfileSummaryType, } from "../../validation/schemas/responses";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import { parseOr, } from "./validation";

const log = rootLog.child({ module: "admin-templates", },);

type ProfileSummary = ProfileSummaryType;

interface ProfileDetail extends ProfileSummary {
  templates: Record<string, Record<string, string>>;
}

interface EditingTemplate {
  detail: string;
  mode: string;
  value: string;
}

interface NewProfile {
  id: string;
  name: string;
  families: string;
  promptFormat: string;
  maxTokenHint: number;
}

const DETAIL_LABELS: Record<string, string> = {
  instant: "Instant",
  balanced: "Balanced",
  detailed: "Detailed",
};

const MODE_LABELS: Record<string, string> = {
  yourself: "Yourself",
  face: "Face",
  me: "Me",
  scene: "Scene",
  last: "Last",
  background: "Background",
};

export const adminTemplates = {
  // ── List state ──────────────────────────────────────
  templateProfiles: [] as ProfileSummary[],
  defaultProfileId: "sdxl",
  builtinCount: 0,
  customCount: 0,
  loadingTemplates: false,

  // ── Detail view state ───────────────────────────────
  selectedProfile: null as ProfileDetail | null,

  // ── Inline edit state ───────────────────────────────
  editingTemplate: null as EditingTemplate | null,
  savingTemplate: false,

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

  clearSelection() {
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

  // ── Inline template editing ─────────────────────────

  startEditTemplate(detail: string, mode: string, value: string,) {
    this.editingTemplate = { detail, mode, value, };
  },

  cancelEditTemplate() {
    this.editingTemplate = null;
  },

  async saveTemplate() {
    if (!this.editingTemplate || !this.selectedProfile) { return; }
    this.savingTemplate = true;
    try {
      const { detail, mode, value, } = this.editingTemplate;
      const res = await (globalThis as any).apiFetch(
        `/api/admin/templates/${this.selectedProfile.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ detail, mode, template: value, },),
        },
      );
      if (res.ok) {
        (globalThis as any).showToast("success", t("toasts.templateSaved",),);
        // Update local state
        if (this.selectedProfile.templates) {
          if (!this.selectedProfile.templates[detail]) {
            this.selectedProfile.templates[detail] = {};
          }
          this.selectedProfile.templates[detail][mode] = value;
        }
        this.editingTemplate = null;
        // Refresh list counts
        await this.loadTemplates();
      } else {
        const err = await res.json();
        (globalThis as any).showToast("error", err.error || t("toasts.failedSave",),);
      }
    } catch {
      (globalThis as any).showToast("error", t("toasts.networkError",),);
    } finally {
      this.savingTemplate = false;
    }
  },

  // ── Save model defaults ─────────────────────────────

  async saveDefaults() {
    if (!this.selectedProfile) { return; }
    try {
      const d = this.selectedProfile.defaults;
      const res = await (globalThis as any).apiFetch(
        `/api/admin/templates/${this.selectedProfile.id}/defaults`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            cfgScale: d.cfgScale,
            steps: d.steps,
            sampler: d.sampler,
            scheduler: d.scheduler,
            maxTokenHint: this.selectedProfile.maxTokenHint,
          },),
        },
      );
      if (res.ok) {
        (globalThis as any).showToast("success", t("toasts.defaultsSaved",),);
        await this.loadTemplates();
      } else {
        const err = await res.json();
        (globalThis as any).showToast("error", err.error || t("toasts.failedSave",),);
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
      const families = np.families
        .split(",",)
        .map((s,) => s.trim())
        .filter(Boolean,);
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

  // ── Formatters ──────────────────────────────────────

  formatDetail(detail: string,): string {
    return DETAIL_LABELS[detail] ?? detail;
  },

  formatMode(mode: string,): string {
    return MODE_LABELS[mode] ?? mode;
  },
};
