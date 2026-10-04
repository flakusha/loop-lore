// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";

interface ConfigMenuField {
  key: string;
  path?: string;
  label: string;
  type: "boolean" | "string" | "number" | "enum" | "array" | "object";
  description?: string;
  default?: unknown;
  required: boolean;
  secret: boolean;
  restart: boolean;
  perChat: boolean;
  editable: boolean;
  scope: string;
}

interface ConfigMenuSection {
  key: string;
  title: string;
  description?: string;
  scope: string;
  fields: ConfigMenuField[];
}

function configMenu() {
  return {
    loading: true,
    role: "user" as "admin" | "user",
    sections: [] as ConfigMenuSection[],
    activeSection: "",
    values: {} as Record<string, unknown>,
    dirtyKeys: new Set<string>(),
    dirty: false,
    saving: false,

    async init() {
      try {
        const res = await apiFetch("/api/config-menu", { headers: { Accept: "application/json", }, },);
        if (res.ok) {
          const data = await res.json();
          this.role = data.role;
          this.sections = data.sections;
          if (this.sections.length > 0) { this.activeSection = this.sections[0]!.key; }
          for (const s of this.sections) {
            for (const f of s.fields) {
              this.values[f.key] = f.default ?? (f.type === "boolean" ? false : "");
            }
          }
        }
      } catch {
        /* ignore */
      }

      this.loading = false;
    },

    markDirty(key: string,) {
      this.dirtyKeys.add(key,);
      this.dirty = true;
    },

    async saveAll() {
      this.saving = true;
      const entries = [...this.dirtyKeys,];
      for (const key of entries) {
        try {
          await apiFetch("/api/config-menu", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({ key, value: this.values[key], },),
          },);
        } catch {
          /* ignore */
        }
      }

      this.dirtyKeys.clear();
      this.dirty = false;
      this.saving = false;
    },
  };
}

globalThis.configMenu = configMenu;
