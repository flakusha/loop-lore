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
  templates: Record<string, Record<string, string>>;
}

export const adminTemplates = {
  templates: {} as Record<string, TemplateProfile>,
  templateList: [] as TemplateProfile[],
  loadingTemplates: false,
  editingTemplateId: "",
  editDraft: {} as Partial<TemplateProfile>,
  creatingNew: false,
  newDraft: {
    id: "",
    name: "",
    families: [] as string[],
    promptFormat: "tags" as string,
    maxTokenHint: 256,
    defaults: { cfgScale: 7, steps: 20, sampler: "euler_a", },
    templates: { instant: {}, balanced: {}, detailed: {}, },
  } as Partial<TemplateProfile>,

  async loadTemplates() {
    this.loadingTemplates = true;
    try {
      const res = await fetch("/api/admin/templates", { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        this.templates = await res.json();
        this.templateList = Object.values(this.templates,);
      }
    } catch {
      log.warn("Failed to load templates",);
    } finally {
      this.loadingTemplates = false;
    }
  },

  startEdit(id: string,) {
    const t = this.templates[id];
    if (!t) { return; }
    this.editingTemplateId = id;
    this.editDraft = { ...t, templates: { ...t.templates, }, };
    this.creatingNew = false;
  },

  cancelEdit() {
    this.editingTemplateId = "";
    this.editDraft = {};
    this.creatingNew = false;
  },

  startCreate() {
    this.creatingNew = true;
    this.editingTemplateId = "";
    this.newDraft = {
      id: "",
      name: "",
      families: [] as string[],
      promptFormat: "tags",
      maxTokenHint: 256,
      defaults: { cfgScale: 7, steps: 20, sampler: "euler_a", },
      templates: { instant: {}, balanced: {}, detailed: {}, },
    };
  },

  async saveTemplate(id: string,) {
    const draft = this.creatingNew ? this.newDraft : this.editDraft;
    try {
      const url = this.creatingNew ? "/api/admin/templates" : `/api/admin/templates/${id}`;
      const method = this.creatingNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json", },
        body: JSON.stringify(draft,),
      },);
      if (res.ok) {
        await this.loadTemplates();
        this.cancelEdit();
      } else {
        log.warn(`Failed to save template ${id}`,);
      }
    } catch {
      log.warn("Network error saving template",);
    }
  },

  async deleteTemplate(id: string,) {
    try {
      const res = await fetch(`/api/admin/templates/${id}`, { method: "DELETE", },);
      if (res.ok) {
        await this.loadTemplates();
      } else {
        log.warn(`Failed to delete template ${id}`,);
      }
    } catch {
      log.warn("Network error deleting template",);
    }
  },

  getEditingTemplate(): Partial<TemplateProfile> | null {
    if (this.creatingNew) { return this.newDraft; }
    return this.editingTemplateId ? this.editDraft : null;
  },
};
