// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "personas", },);

interface PersonaItem {
  id: string;
  name: string;
  description: string | null;
  title: string | null;
  is_default: string;
  temperature: number | null;
  max_tokens: number | null;
  model: string | null;
}

globalThis.personasPage = function() {
  return {
    personas: [] as PersonaItem[],
    filtered: [] as PersonaItem[],
    search: "",
    loading: true,
    saving: false,
    formName: "",
    formTitle: "",
    formDescription: "",
    formIsDefault: false,
    formModel: "",
    formMaxTokens: "" as string | number,
    formTemperature: "" as string | number,
    personaAvailableModels: [] as string[],

    async init() {
      await this.loadPersonas();
      await this.loadPersonaModels();
    },

    async loadPersonaModels() {
      try {
        const res = await apiFetch("/api/providers", { headers: { Accept: "application/json", }, },);
        if (!res.ok) { return; }
        const data = await res.json();
        const models: string[] = [];
        const providers = data.providers || [];
        for (const p of providers) {
          if (p.status !== "healthy") { continue; }
          await this._collectModelsForProvider(p.name, models,);
        }
        this.personaAvailableModels = models;
      } catch {
        /* network error — keep empty */
      }
    },

    async _collectModelsForProvider(providerName: string, models: string[],) {
      try {
        const modelsRes = await apiFetch(`/api/admin/providers/${providerName}/models`, {
          headers: { Accept: "application/json", },
        },);
        if (!modelsRes.ok) { return; }
        const modelsData = await modelsRes.json();
        const discovered = modelsData.models || [];
        for (const m of discovered) {
          if (!models.includes(m.id,)) { models.push(m.id,); }
        }
      } catch {
        /* skip provider */
      }
    },

    async loadPersonas() {
      this.loading = true;
      try {
        const res = await apiFetch("/api/personas", { headers: { Accept: "application/json", }, },);
        if (res.ok) {
          const data = await res.json();
          this.personas = Array.isArray(data,) ? data : [];
          this.filterList();
        }
      } catch (error) {
        log.warn("loadPersonas failed", { error: String(error,), },);
      }
      this.loading = false;
    },

    filterList() {
      const q = this.search.toLowerCase().trim();
      if (!q) {
        this.filtered = this.personas;
        return;
      }
      const out: PersonaItem[] = [];
      const personas = this.personas;
      for (const p of personas) { if (p.name.toLowerCase().includes(q,)) { out.push(p,); } }
      this.filtered = out;
    },

    editPersona(p: PersonaItem,) {
      if (!globalThis.Alpine) { return; }
      const ui = Alpine.store("ui",);
      ui.activePersona = p;
      this.formName = p.name;
      this.formTitle = p.title || "";
      this.formDescription = p.description || "";
      this.formIsDefault = p.is_default === "default";
      this.formModel = p.model || "";
      this.formMaxTokens = p.max_tokens ?? "";
      this.formTemperature = p.temperature ?? "";
      ui.showPersonaForm = true;
    },

    async savePersona() {
      const name = this.formName.trim();
      if (!name) { return; }

      if (!globalThis.Alpine) { return; }
      const ui = Alpine.store("ui",);
      const active = ui.activePersona as PersonaItem | null;
      this.saving = true;

      try {
        const url = active ? `/api/personas/${active.id}` : "/api/personas";
        const method = active ? "PATCH" : "POST";
        const body: Record<string, unknown> = { name, };
        if (this.formTitle) { body.title = this.formTitle; }
        if (this.formDescription) { body.description = this.formDescription; }
        if (active) { body.isDefault = this.formIsDefault; }
        // Tuning fields: send null to clear, omit to leave unchanged on update
        body.model = this.formModel.trim() || null;
        body.maxTokens = this.formMaxTokens === "" ? null : Number(this.formMaxTokens,);
        body.temperature = this.formTemperature === "" ? null : Number(this.formTemperature,);

        const res = await apiFetch(url, {
          method,
          headers: { "Content-Type": "application/json", Accept: "application/json", },
          body: jsonBody(body,),
        },);

        if (res.ok) {
          ui.showPersonaForm = false;
          ui.activePersona = null;
          this.formName = "";
          this.formTitle = "";
          this.formDescription = "";
          this.formIsDefault = false;
          this.formModel = "";
          this.formMaxTokens = "";
          this.formTemperature = "";
          await this.loadPersonas();
        }
      } catch (error) {
        log.warn("savePersona failed", { error: String(error,), },);
      }
      this.saving = false;
    },

    async deletePersona(id: string,) {
      if (!confirm("Delete this persona?",)) { return; }
      try {
        const res = await apiFetch(`/api/personas/${id}`, { method: "DELETE", },);
        if (res.ok) {
          const out: PersonaItem[] = [];
          for (const p of this.personas) { if (p.id !== id) { out.push(p,); } }
          this.personas = out;
          this.filterList();
        }
      } catch (error) {
        log.warn("deletePersona failed", { error: String(error,), },);
      }
    },

    onDefaultChange() {
      // handled on save
    },
  };
};
