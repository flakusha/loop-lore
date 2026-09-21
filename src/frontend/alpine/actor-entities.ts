// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 285

// ── Actor entity CRUD panel state.
// Generic plugin for `/api/v1/actors/:actorId/{notes,items,lore-entries}` plus
// per-kind UI shaping. One factory instance per panel; the kind is bound at
// construction.
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "actor-entities", },);

/** Kinds supported by `createEntityRoutes` under actor scope. */
export type EntityKind = "notes" | "items" | "lore-entries";

/** A single entity row as returned by the CRUD endpoints. */
export interface ActorEntityRow {
  id: string;
  actor_id?: string;
  title?: string;
  content?: string;
  name?: string;
  description?: string;
  quantity?: number;
  [key: string]: unknown;
}

/** Per-kind field schema for the create/edit form. */
interface EntityKindConfig {
  /** URL path segment (matches `entityPath`). */
  path: EntityKind;
  /** Singular display name. */
  label: string;
  /** Plural display name. */
  plural: string;
  /** Field set used for create/update; rendered by the panel. */
  fields: { key: string; label: string; kind: "text" | "textarea" | "number"; required: boolean }[];
  /** Title-like field used for the row summary. */
  titleField: string;
}

const KIND_CONFIG: Record<EntityKind, EntityKindConfig> = {
  notes: {
    path: "notes",
    label: "Note",
    plural: "Notes",
    titleField: "title",
    fields: [
      { key: "title", label: "Title", kind: "text", required: true, },
      { key: "content", label: "Body", kind: "textarea", required: false, },
    ],
  },
  items: {
    path: "items",
    label: "Item",
    plural: "Items",
    titleField: "name",
    fields: [
      { key: "name", label: "Name", kind: "text", required: true, },
      { key: "description", label: "Description", kind: "textarea", required: false, },
      { key: "quantity", label: "Quantity", kind: "number", required: false, },
    ],
  },
  "lore-entries": {
    path: "lore-entries",
    label: "Lore Entry",
    plural: "Lore Entries",
    titleField: "title",
    fields: [
      { key: "title", label: "Title", kind: "text", required: true, },
      { key: "content", label: "Content", kind: "textarea", required: true, },
    ],
  },
};

/**
 * State plugin for a single actor entity panel (notes | items | lore-entries).
 * Bound to an actor + entity kind at construction. CRUD-only — no gameplay
 * side-effects (equip/carry/etc. are owned by `actor-items/service.ts`).
 */
export interface ActorEntitiesState {
  _entActorId: string | null;
  _entKind: EntityKind;
  rows: ActorEntityRow[];
  rowsLoading: boolean;
  rowsError: string;
  form: Record<string, string>;
  editingId: string | null;
  search: string;
  busy: boolean;
  /** Filter rows by free-text match against the title field. */
  filteredRows(): ActorEntityRow[];
  /** Read the panel's kind config (path, labels, fields). */
  config(): EntityKindConfig;
  /** Reset the form to empty values. */
  resetForm(): void;
  /** Seed the form from an existing row (for inline edit). */
  loadIntoForm(row: ActorEntityRow,): void;
  /** Reload the entity list from the server. */
  load(): Promise<void>;
  /** Create a new row from the current form, then refresh. */
  create(): Promise<void>;
  /** PUT the form fields onto `editingId`, then refresh. */
  save(): Promise<void>;
  /** DELETE a single row by id, then refresh. */
  remove(id: string,): Promise<void>;
  /** Cancel an in-progress edit and reset the form. */
  cancelEdit(): void;
}

const emptyForm = (kind: EntityKind,): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const f of KIND_CONFIG[kind].fields) { out[f.key] = ""; }
  return out;
};
/** Build a state with defaults for a given kind, no auto-load. Exported so
 * tests can avoid the factory's auto `load()` side effect. */
export const stateFromKind = (kind: EntityKind,): ActorEntitiesState => ({
  _entActorId: null,
  _entKind: kind,
  rows: [],
  rowsLoading: false,
  rowsError: "",
  form: emptyForm(kind,),
  editingId: null,
  search: "",
  busy: false,

  filteredRows() {
    const q = this.search.trim().toLowerCase();
    if (!q) { return this.rows; }
    const titleKey = this.config().titleField;
    return this.rows.filter((r,) => String(r[titleKey] ?? "",).toLowerCase().includes(q,));
  },

  config() {
    return KIND_CONFIG[this._entKind];
  },

  resetForm() {
    this.form = emptyForm(this._entKind,);
    this.editingId = null;
  },

  loadIntoForm(row: ActorEntityRow,) {
    const next: Record<string, string> = {};
    for (const f of this.config().fields) {
      const v = row[f.key];
      next[f.key] = v === null || v === undefined ? "" : String(v,);
    }
    this.form = next;
    this.editingId = row.id;
  },

  async load() {
    const actorId = this._entActorId;
    if (!actorId) { return; }
    this.rowsLoading = true;
    try {
      const url = `/api/v1/actors/${actorId}/${this._entKind}`;
      const res = await apiFetch(url,);
      if (!res.ok) {
        this.rowsError = t("status.entitiesLoadFailed",);
        return;
      }
      const body = (await res.json()) as { data?: ActorEntityRow[] };
      this.rows = Array.isArray(body.data,) ? body.data : [];
    } catch (error) {
      log.error("Failed to load entities", error instanceof Error ? error : undefined, { kind: this._entKind, },);
      this.rowsError = t("status.entitiesLoadFailed",);
    } finally {
      this.rowsLoading = false;
    }
  },

  async create() {
    const actorId = this._entActorId;
    if (!actorId || this.busy) { return; }
    this.busy = true;
    this.rowsError = "";
    try {
      const payload: Record<string, unknown> = {};
      for (const f of this.config().fields) {
        if (f.kind === "number") {
          const n = Number(this.form[f.key],);
          if (this.form[f.key] !== "" && Number.isFinite(n,)) { payload[f.key] = n; }
        } else if (this.form[f.key] !== "") {
          payload[f.key] = this.form[f.key];
        }
      }
      const res = await apiFetch(`/api/v1/actors/${actorId}/${this._entKind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(payload,),
      },);
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as Record<string, unknown>)) as {
          message?: string;
        };
        this.rowsError = body.message ?? t("status.entitiesCreateFailed",);
        return;
      }
      this.resetForm();
      await this.load();
    } catch (error) {
      log.error("Failed to create entity", error instanceof Error ? error : undefined, { kind: this._entKind, },);
      this.rowsError = t("status.entitiesCreateFailed",);
    } finally {
      this.busy = false;
    }
  },

  async save() {
    const actorId = this._entActorId;
    const editingId = this.editingId;
    if (!actorId || !editingId || this.busy) { return; }
    this.busy = true;
    this.rowsError = "";
    try {
      const payload: Record<string, unknown> = {};
      for (const f of this.config().fields) {
        if (f.kind === "number") {
          const n = Number(this.form[f.key],);
          if (this.form[f.key] !== "" && Number.isFinite(n,)) { payload[f.key] = n; }
        } else {
          payload[f.key] = this.form[f.key];
        }
      }
      const res = await apiFetch(`/api/v1/actors/${actorId}/${this._entKind}/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(payload,),
      },);
      if (!res.ok) {
        this.rowsError = t("status.entitiesSaveFailed",);
        return;
      }
      this.resetForm();
      await this.load();
    } catch (error) {
      log.error("Failed to save entity", error instanceof Error ? error : undefined, { kind: this._entKind, },);
      this.rowsError = t("status.entitiesSaveFailed",);
    } finally {
      this.busy = false;
    }
  },

  async remove(id: string,) {
    const actorId = this._entActorId;
    if (!actorId || this.busy) { return; }
    this.busy = true;
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/${this._entKind}/${id}`, { method: "DELETE", },);
      if (!res.ok) { return; }
      await this.load();
    } catch (error) {
      log.error("Failed to delete entity", error instanceof Error ? error : undefined, { kind: this._entKind, },);
    } finally {
      this.busy = false;
    }
  },

  cancelEdit() {
    this.resetForm();
  },
});

/** Build a notes/items/lore panel bound to a specific actor. */
export function actorEntitiesFactory(actorId: string, kind: EntityKind,): ActorEntitiesState {
  const state = stateFromKind(kind,);
  state._entActorId = actorId;
  void state.load();
  return state;
}

(globalThis as Record<string, unknown>).actorEntitiesFactory = actorEntitiesFactory;
