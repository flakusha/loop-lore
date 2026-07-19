import { jsonBody } from "./json";
import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "personas" });

interface PersonaItem {
  id: string;
  name: string;
  description: string | null;
  title: string | null;
  is_default: string;
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

    async init() {
      if (!globalThis.Alpine) return;
      Alpine.store("ui", Alpine.store("ui") || {});
      const ui = Alpine.store("ui");
      if (!("showPersonaForm" in ui)) ui.showPersonaForm = false;
      if (!("activePersona" in ui)) ui.activePersona = null;
      await this.loadPersonas();
    },

    async loadPersonas() {
      this.loading = true;
      try {
        const res = await fetch("/api/personas", { headers: { Accept: "application/json" } });
        if (res.ok) {
          const data = await res.json();
          this.personas = Array.isArray(data) ? data : [];
          this.filterList();
        }
      } catch (error) {
        log.warn("loadPersonas failed", { error: String(error) });
      }
      this.loading = false;
    },

    filterList() {
      const q = this.search.toLowerCase().trim();
      this.filtered = q ? this.personas.filter((p) => p.name.toLowerCase().includes(q)) : this.personas;
    },

    editPersona(p: PersonaItem) {
      if (!globalThis.Alpine) return;
      const ui = Alpine.store("ui");
      ui.activePersona = p;
      this.formName = p.name;
      this.formTitle = p.title || "";
      this.formDescription = p.description || "";
      this.formIsDefault = p.is_default === "default";
      ui.showPersonaForm = true;
    },

    async savePersona() {
      const name = this.formName.trim();
      if (!name) return;

      if (!globalThis.Alpine) return;
      const ui = Alpine.store("ui");
      const active = ui.activePersona as PersonaItem | null;
      this.saving = true;

      try {
        const url = active ? `/api/personas/${active.id}` : "/api/personas";
        const method = active ? "PATCH" : "POST";
        const body: Record<string, unknown> = { name };
        if (this.formTitle) body.title = this.formTitle;
        if (this.formDescription) body.description = this.formDescription;
        if (active) body.isDefault = this.formIsDefault;

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: jsonBody(body),
        });

        if (res.ok) {
          ui.showPersonaForm = false;
          ui.activePersona = null;
          this.formName = "";
          this.formTitle = "";
          this.formDescription = "";
          this.formIsDefault = false;
          await this.loadPersonas();
        }
      } catch (error) {
        log.warn("savePersona failed", { error: String(error) });
      }
      this.saving = false;
    },

    async deletePersona(id: string) {
      if (!confirm("Delete this persona?")) return;
      try {
        const res = await fetch(`/api/personas/${id}`, { method: "DELETE" });
        if (res.ok) {
          this.personas = this.personas.filter((p) => p.id !== id);
          this.filterList();
        }
      } catch (error) {
        log.warn("deletePersona failed", { error: String(error) });
      }
    },

    onDefaultChange() {
      // handled on save
    },
  };
};
