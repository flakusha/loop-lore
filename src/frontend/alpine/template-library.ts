// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt Template Library browser (FEAT-065) — settings modal "Templates" tab.
 *
 * Lists the user's templates (plus LLM presets) from GET /api/templates, with
 * create / edit / delete, JSON payload preview, and pack import/export via
 * POST /api/templates/import and GET /api/templates/export.
 */
import { jsonBody, } from "./json";

interface TemplateSummary {
  id: string;
  modality: string;
  name: string;
  description: string | null;
  detail_level: string;
  isPreset: boolean;
  isOwner: boolean;
}

interface TemplateDetail extends TemplateSummary {
  payload: Record<string, unknown>;
}

(globalThis as unknown as Record<string, unknown>).templateLibrary = function() {
  return {
    open: false,
    loading: false,
    error: "",
    modality: "",
    templates: [] as TemplateSummary[],
    editingId: "" as string,
    draft: null as { name: string; modality: string; description: string; payload: string } | null,
    saving: false,

    async load() {
      this.loading = true;
      this.error = "";
      try {
        const q = this.modality ? `?modality=${encodeURIComponent(this.modality,)}` : "";
        const res = await apiFetch(`/api/templates${q}`,);
        if (res.ok) {
          const body = await res.json();
          this.templates = body.templates ?? [];
        } else {
          this.error = "Failed to load templates";
        }
      } catch {
        this.error = "Failed to load templates";
      } finally {
        this.loading = false;
      }
    },

    startCreate() {
      this.editingId = "";
      this.draft = { name: "", modality: "image", description: "", payload: '{\n  "templateBody": ""\n}', };
    },

    async startEdit(id: string,) {
      try {
        const res = await apiFetch(`/api/templates/${encodeURIComponent(id,)}`,);
        if (!res.ok) { this.error = "Failed to load template"; return; }
        const body = await res.json();
        const t = body.template as TemplateDetail;
        this.editingId = t.isPreset ? "" : t.id;
        if (t.isPreset) {
          // Presets are read-only; open a copy for the user to own.
          this.draft = {
            name: `${t.name} (copy)`,
            modality: t.modality,
            description: t.description ?? "",
            payload: JSON.stringify(t.payload, null, 2,),
          };
        } else {
          this.draft = {
            name: t.name,
            modality: t.modality,
            description: t.description ?? "",
            payload: JSON.stringify(t.payload, null, 2,),
          };
        }
      } catch {
        this.error = "Failed to load template";
      }
    },

    async save() {
      if (!this.draft) { return; }
      this.saving = true;
      this.error = "";
      try {
        let payload: unknown;
        try {
          payload = JSON.parse(this.draft.payload,);
        } catch {
          this.error = "Payload is not valid JSON";
          return;
        }
        const input = {
          name: this.draft.name,
          modality: this.draft.modality,
          description: this.draft.description || undefined,
          payload,
        };
        const res = this.editingId
          ? await apiFetch(`/api/templates/${encodeURIComponent(this.editingId,)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", },
              body: jsonBody(input,),
            },)
          : await apiFetch("/api/templates", {
              method: "POST",
              headers: { "Content-Type": "application/json", },
              body: jsonBody(input,),
            },);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: unknown };
          this.error = typeof body.message === "string" ? body.message : "Save failed";
          return;
        }
        this.draft = null;
        this.editingId = "";
        await this.load();
      } finally {
        this.saving = false;
      }
    },

    async remove(id: string,) {
      if (!confirm("Delete this template?",)) { return; }
      try {
        await apiFetch(`/api/templates/${encodeURIComponent(id,)}`, { method: "DELETE", },);
        await this.load();
      } catch {
        this.error = "Delete failed";
      }
    },

    async exportPack() {
      try {
        const res = await apiFetch("/api/templates/export",);
        if (!res.ok) { this.error = "Export failed"; return; }
        const blob = new Blob([JSON.stringify(await res.json(), null, 2,)], { type: "application/json", },);
        const url = URL.createObjectURL(blob,);
        const a = document.createElement("a",);
        a.href = url;
        a.download = "template-pack.json";
        a.click();
        URL.revokeObjectURL(url,);
      } catch {
        this.error = "Export failed";
      }
    },

    async importPack(file: File,) {
      this.error = "";
      try {
        const pack = JSON.parse(await file.text());
        const res = await apiFetch("/api/templates/import", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody(pack,),
        },);
        if (!res.ok) { this.error = "Import failed"; return; }
        await this.load();
      } catch {
        this.error = "Import failed";
      }
    },
  };
};
