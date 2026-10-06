// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Config menu — Alpine component.
 *
 * One catalog (`GET /api/config-menu`) drives every panel: the server decides
 * which sections/fields a role may see and which are editable, this layer only
 * renders and batches writes. Pure helpers are exported separately so the
 * coercion/validation/grouping rules are unit-testable without a DOM.
 */
import { safeJsonParse, safeJsonStringify, } from "../../utils/safe-json";
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "config-menu", },);

export interface ConfigMenuField {
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
  options?: string[];
}

export interface ConfigMenuSection {
  key: string;
  title: string;
  description?: string;
  group?: string;
  scope: string;
  fields: ConfigMenuField[];
}

export interface ConfigMenuGroup {
  group: string;
  sections: ConfigMenuSection[];
}

export type SaveState = "idle" | "saving" | "saved" | "error";

/** Fetch seam — injectable so tests can drive the component without network. */
export type ApiFetchFn = (url: string, opts?: RequestInit,) => Promise<Response>;

const UNGROUPED = "Other";

/**
 * Bucket sections by their catalog `group`, preserving catalog order. A section
 * with no group lands in "Other" rather than being dropped.
 * @param sections
 */
export function groupSections(sections: ConfigMenuSection[],): ConfigMenuGroup[] {
  const groups: ConfigMenuGroup[] = [];
  for (const section of sections) {
    const name = section.group ?? UNGROUPED;
    const existing = groups.find((g,) => g.group === name);
    if (existing) { existing.sections.push(section,); }
    else { groups.push({ group: name, sections: [section,], },); }
  }

  return groups;
}

/**
 * Coerce a raw input value to the type the PATCH body should carry. Mirrors the
 * server's `coerceValue` but keeps native JSON types instead of stringifying.
 * @param field
 * @param raw
 */
export function coerceFieldValue(field: ConfigMenuField, raw: unknown,): unknown {
  switch (field.type) {
    case "boolean": {
      return raw === true || raw === "true" || raw === "1";
    }

    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw,);
      return Number.isFinite(n,) ? n : raw;
    }

    case "array":
    case "object": {
      if (typeof raw !== "string") { return raw; }
      const trimmed = raw.trim();
      if (trimmed === "") { return raw; }
      const parsed = safeJsonParse(trimmed,);
      return parsed.ok ? parsed.value : raw;
    }

    default: {
      return raw === null || raw === undefined ? "" : String(raw,);
    }
  }
}

/**
 * Per-type validation for a raw input value. Returns an error message, or null
 * when the value is acceptable. Empty values are allowed on optional fields (a
 * cleared field) — only structurally invalid input (non-numeric number, bad
 * enum, broken JSON) is rejected.
 * @param field
 * @param raw
 */
export function validateFieldValue(field: ConfigMenuField, raw: unknown,): string | null {
  const isEmpty = raw === "" || raw === null || raw === undefined;
  switch (field.type) {
    case "number": {
      if (isEmpty) { return field.required ? "Enter a number" : null; }
      return Number.isFinite(Number(raw,),) ? null : "Enter a valid number";
    }

    case "enum": {
      if (isEmpty) { return field.required ? "Select a value" : null; }
      if (field.options && field.options.length > 0 && !field.options.includes(String(raw,),)) {
        return "Not an allowed value";
      }

      return null;
    }

    case "array":
    case "object": {
      if (isEmpty || typeof raw !== "string") { return null; }
      return safeJsonParse(raw,).ok ? null : "Enter valid JSON";
    }

    default: {
      return null;
    }
  }
}

/** The Alpine component state factory. */
export function createConfigMenuState(opts: { fetch?: ApiFetchFn } = {},) {
  const request: ApiFetchFn = opts.fetch ?? apiFetch;
  return {
    loading: true,
    role: "user" as "admin" | "user",
    sections: [] as ConfigMenuSection[],
    groups: [] as ConfigMenuGroup[],
    activeGroup: "",
    activeSection: "",
    values: {} as Record<string, unknown>,
    baseline: {} as Record<string, unknown>,
    dirtyKeys: {} as Record<string, true>,
    dirty: false,
    saveState: "idle" as SaveState,
    errorMessage: "",

    async init() {
      try {
        const res = await request("/api/config-menu", { headers: { Accept: "application/json", }, },);
        const data = await res.json() as { role: "admin" | "user"; sections: ConfigMenuSection[] };
        this.role = data.role;
        this.sections = data.sections ?? [];
        this.groups = groupSections(this.sections,);
        for (const s of this.sections) {
          for (const f of s.fields) {
            const initial = f.default ?? (f.type === "boolean" ? false : "");
            this.values[f.key] = initial;
            this.baseline[f.key] = initial;
          }
        }

        const hash = typeof location === "undefined" ? "" : location.hash.replace(/^#/, "",);
        const wanted = this.sections.find((s,) => s.key === hash);
        this.selectSection(wanted?.key ?? this.sections[0]?.key ?? "",);
      } catch (error) {
        log.warn("Failed to load config menu", { error: String(error,), },);
        this.errorMessage = "Failed to load configuration";
        this.saveState = "error";
      } finally {
        this.loading = false;
      }
    },

    /** Switch the visible panel and deep-link it via the URL hash. */
    selectSection(key: string,) {
      if (!key) { return; }
      this.activeSection = key;
      this.activeGroup = this.sections.find((s,) => s.key === key)?.group ?? UNGROUPED;
      if (typeof location !== "undefined" && typeof history !== "undefined") {
        history.replaceState(null, "", `#${key}`,);
      }
    },

    /** Sections belonging to the currently selected group. */
    activeGroupSections(): ConfigMenuSection[] {
      return this.groups.find((g,) => g.group === this.activeGroup)?.sections ?? [];
    },

    currentSection(): ConfigMenuSection | undefined {
      return this.sections.find((s,) => s.key === this.activeSection);
    },

    /** Record a new value, tracking dirtiness and re-validating the field. */
    setValue(field: ConfigMenuField, raw: unknown,) {
      this.values[field.key] = raw;
      if (!this.canEdit(field,)) { return; }
      const a = safeJsonStringify(raw,);
      const b = safeJsonStringify(this.baseline[field.key],);
      const dirty = a.ok && b.ok ? a.value !== b.value : a.ok !== b.ok;
      if (dirty) { this.dirtyKeys[field.key] = true; }
      else { delete this.dirtyKeys[field.key]; }

      this.dirty = Object.keys(this.dirtyKeys,).length > 0;
      if (this.saveState === "saved" || this.saveState === "error") { this.saveState = "idle"; }
    },

    isDirty(key: string,): boolean {
      return this.dirtyKeys[key] === true;
    },

    fieldError(field: ConfigMenuField,): string | null {
      return this.isDirty(field.key,) ? validateFieldValue(field, this.values[field.key],) : null;
    },

    /** Whether this role may write the field (catalog already filters by role; this is the defense-in-depth gate). */
    canEdit(field: ConfigMenuField,): boolean {
      return field.editable && (field.scope !== "admin" || this.role === "admin");
    },

    /** Keys that are dirty, editable, role-permitted, and valid — the batch the save will send. */
    pendingKeys(): { key: string; field: ConfigMenuField }[] {
      const pending: { key: string; field: ConfigMenuField }[] = [];
      for (const s of this.sections) {
        for (const f of s.fields) {
          if (!this.canEdit(f,) || !this.isDirty(f.key,)) { continue; }
          if (validateFieldValue(f, this.values[f.key],) !== null) { continue; }
          pending.push({ key: f.key, field: f, },);
        }
      }

      return pending;
    },

    /** PATCH every pending key; failed keys stay dirty and surface as an error. */
    async saveAll() {
      const pending = this.pendingKeys();
      if (pending.length === 0) { return; }
      this.saveState = "saving";
      this.errorMessage = "";
      const failed: string[] = [];
      for (const { key, field, } of pending) {
        try {
          await request("/api/config-menu", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({ key, value: coerceFieldValue(field, this.values[key],), },),
          },);

          delete this.dirtyKeys[key];
          this.baseline[key] = this.values[key];
        } catch (error) {
          log.warn("Failed to save config key", { key, error: String(error,), },);
          failed.push(key,);
        }
      }

      this.dirty = Object.keys(this.dirtyKeys,).length > 0;
      if (failed.length > 0) {
        this.saveState = "error";
        this.errorMessage = `Failed to save: ${failed.join(", ",)}`;
      } else {
        this.saveState = "saved";
      }
    },
  };
}

/** Alpine entry point (`x-data="configMenu()"`). */
function configMenu() {
  return createConfigMenuState();
}

globalThis.configMenu = configMenu;
