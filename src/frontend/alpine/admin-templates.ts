import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "admin-templates", },);

interface TemplateProfile {
  id: string;
  name: string;
  families: string[];
  promptFormat: string;
  maxTokenHint: number;
  defaults: {
    cfgScale: number;
    steps: number;
    sampler: string;
    scheduler?: string;
    clipSkip?: number;
  };
  isBuiltin: boolean;
  templateCount: number;
}

interface TemplateProfileDetail extends TemplateProfile {
  templates: Record<string, Record<string, string>>;
}

export const adminTemplates = {
  templateProfiles: [] as TemplateProfile[],
  selectedProfile: null as TemplateProfileDetail | null,
  loadingTemplates: false,
  savingTemplate: false,
  editingTemplate: { detail: "", mode: "", value: "", },
  showCreateModal: false,
  newProfile: { id: "", name: "", families: "", promptFormat: "tags", maxTokenHint: 150, },
  defaultProfileId: "sdxl",
  builtinCount: 0,
  customCount: 0,

  async loadTemplates() {
    this.loadingTemplates = true;
    try {
      const res = await fetch("/api/admin/templates", { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = await res.json();
        this.templateProfiles = data.profiles || [];
        this.defaultProfileId = data.defaultProfileId;
        this.builtinCount = data.builtinCount;
        this.customCount = data.customCount;
      }
    } catch {
      log.warn("Network error loading templates",);
    } finally {
      this.loadingTemplates = false;
    }
  },

  async selectProfile(id: string,) {
    try {
      const res = await fetch(`/api/admin/templates/${id}`, { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        this.selectedProfile = await res.json();
      }
    } catch {
      log.warn(`Failed to load profile ${id}`,);
    }
  },

  clearSelection() {
    this.selectedProfile = null;
  },

  startEditTemplate(detail: string, mode: string, currentValue: string,) {
    this.editingTemplate = { detail, mode, value: currentValue, };
  },

  cancelEditTemplate() {
    this.editingTemplate = { detail: "", mode: "", value: "", };
  },

  async saveTemplate() {
    if (!this.selectedProfile || !this.editingTemplate.detail || !this.editingTemplate.mode) { return; }
    this.savingTemplate = true;
    try {
      const res = await apiFetch(`/api/admin/templates/${this.selectedProfile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          detail: this.editingTemplate.detail,
          mode: this.editingTemplate.mode,
          template: this.editingTemplate.value,
        },),
      },);
      if (res.ok) {
        showToast("success", "Template saved",);
        await this.selectProfile(this.selectedProfile.id,);
        this.cancelEditTemplate();
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed",);
      }
    } catch {
      showToast("error", "Network error",);
    } finally {
      this.savingTemplate = false;
    }
  },

  async saveDefaults() {
    if (!this.selectedProfile) { return; }
    try {
      const res = await apiFetch(`/api/admin/templates/${this.selectedProfile.id}/defaults`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(this.selectedProfile.defaults,),
      },);
      if (res.ok) {
        showToast("success", "Defaults saved",);
        await this.selectProfile(this.selectedProfile.id,);
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },

  async createProfile() {
    if (!this.newProfile.id || !this.newProfile.name) { return; }
    try {
      const res = await apiFetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          id: this.newProfile.id,
          name: this.newProfile.name,
          families: this.newProfile.families.split(",",).map((s,) => s.trim()).filter(Boolean,),
          promptFormat: this.newProfile.promptFormat,
          maxTokenHint: this.newProfile.maxTokenHint,
        },),
      },);
      if (res.ok) {
        showToast("success", "Profile created",);
        this.showCreateModal = false;
        this.newProfile = { id: "", name: "", families: "", promptFormat: "tags", maxTokenHint: 150, };
        await this.loadTemplates();
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },

  async deleteProfile(id: string,) {
    if (!confirm(`Delete custom profile '${id}'?`,)) { return; }
    try {
      const res = await apiFetch(`/api/admin/templates/${id}`, { method: "DELETE", },);
      if (res.ok) {
        showToast("success", "Profile deleted",);
        this.clearSelection();
        await this.loadTemplates();
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },

  formatMode(mode: string,): string {
    const labels: Record<string, string> = {
      yourself: "Character Portrait",
      face: "Face Close-up",
      me: "User Portrait",
      scene: "Scene",
      last: "Last Message",
      background: "Background",
    };
    return labels[mode] ?? mode;
  },

  formatDetail(detail: string,): string {
    return detail.charAt(0,).toUpperCase() + detail.slice(1,);
  },
};
