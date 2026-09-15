// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Character permanent traits panel.
// Drives:
//   GET    /api/actors/:actorId/traits
//   POST   /api/actors/:actorId/traits
//   PUT    /api/actors/:actorId/traits/:traitName
//   DELETE /api/actors/:actorId/traits/:traitName
// Pairs with `src/components/character/traits-panel.html`.
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "actor-traits", },);

/** Default categories surfaced in the editor dropdown. */
export const TRAIT_CATEGORIES = [
  "personality",
  "physical",
  "background",
  "skill",
  "weakness",
  "custom",
] as const;

/** A single permanent trait row. */
export interface PermanentTrait {
  id: string;
  actor_id: string;
  trait_category: string;
  trait_name: string;
  value: unknown;
  created_at: string;
}

/** Draft state for the new/edit form. */
export interface TraitDraft {
  category: string;
  name: string;
  value: string;
  editingName: string | null;
}

/**
 * State plugin for the permanent-traits panel. Bound to a single actor via
 * `setActorId`. Supports list/create/update/delete of permanent traits with a
 * search filter and category dropdown.
 */
export interface ActorTraitsState {
  _trActorId: string | null;
  traits: PermanentTrait[];
  traitsLoading: boolean;
  traitsError: string;
  search: string;
  categoryFilter: string;
  draft: TraitDraft;
  busy: boolean;
  message: string;
  error: string;
  setActorId(actorId: string,): void;
  loadTraits(): Promise<void>;
  /** Filter `traits` by `search` + `categoryFilter`. */
  filteredTraits(): PermanentTrait[];
  /** Start editing a trait (copies values into the draft). */
  startEdit(trait: PermanentTrait,): void;
  /** Clear the draft and reset to "create" mode. */
  cancelEdit(): void;
  /** Save the draft (create if `editingName` is null, update otherwise). */
  save(): Promise<void>;
  /** DELETE a trait by name. */
  remove(traitName: string,): Promise<void>;
  /** Build the POST/PUT payload from the draft. */
  buildPayload(): Record<string, unknown>;
  /** Resolve a human label for a trait category code. */
  describeCategory(category: string,): string;
}

const emptyDraft = (): TraitDraft => ({
  category: "personality",
  name: "",
  value: "",
  editingName: null,
});

const CATEGORY_LABELS: Record<string, string> = {
  personality: "Personality",
  physical: "Physical",
  background: "Background",
  skill: "Skill",
  weakness: "Weakness",
  custom: "Custom",
};

export const actorTraits: ActorTraitsState = {
  _trActorId: null,
  traits: [],
  traitsLoading: false,
  traitsError: "",
  search: "",
  categoryFilter: "",
  draft: emptyDraft(),
  busy: false,
  message: "",
  error: "",

  setActorId(actorId: string,) {
    if (this._trActorId === actorId) { return; }
    this._trActorId = actorId;
    this.traits = [];
    this.traitsError = "";
    this.search = "";
    this.categoryFilter = "";
    this.draft = emptyDraft();
    this.busy = false;
    this.message = "";
    this.error = "";
  },

  async loadTraits() {
    const actorId = this._trActorId;
    if (!actorId) { return; }
    this.traitsLoading = true;
    this.traitsError = "";
    try {
      const res = await apiFetch(`/api/actors/${actorId}/traits`, {},);
      if (!res.ok) {
        this.traitsError = t("status.traitsLoadFailed",);
        return;
      }
      const body = (await res.json()) as PermanentTrait[];
      this.traits = Array.isArray(body,) ? body : [];
    } catch (error) {
      log.error("Failed to load traits", error instanceof Error ? error : undefined, {},);
      this.traitsError = t("status.traitsLoadFailed",);
    } finally {
      this.traitsLoading = false;
    }
  },

  filteredTraits() {
    const q = this.search.trim().toLowerCase();
    return this.traits.filter((trait,) => {
      if (this.categoryFilter && trait.trait_category !== this.categoryFilter) { return false; }
      if (!q) { return true; }
      return trait.trait_name.toLowerCase().includes(q,) ||
        trait.trait_category.toLowerCase().includes(q,) ||
        String(trait.value,).toLowerCase().includes(q,);
    },);
  },

  startEdit(trait: PermanentTrait,) {
    this.draft = {
      category: trait.trait_category,
      name: trait.trait_name,
      value: String(trait.value ?? "",),
      editingName: trait.trait_name,
    };
  },

  cancelEdit() {
    this.draft = emptyDraft();
  },

  buildPayload() {
    return {
      trait_category: this.draft.category,
      trait_name: this.draft.name.trim(),
      value: this.draft.value,
    };
  },

  async save() {
    const actorId = this._trActorId;
    if (!actorId || this.busy) { return; }
    if (!this.draft.name.trim()) {
      this.error = t("status.traitsNameRequired",);
      return;
    }
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const isEdit = this.draft.editingName !== null;
      const url = isEdit
        ? `/api/actors/${actorId}/traits/${encodeURIComponent(this.draft.editingName!,)}`
        : `/api/actors/${actorId}/traits`;
      const method = isEdit ? "PUT" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json", },
        body: jsonBody(this.buildPayload(),),
      },);
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as Record<string, unknown>)) as {
          message?: string;
        };
        this.error = body.message ?? t("status.traitsSaveFailed",);
        return;
      }
      this.message = t(isEdit ? "status.traitsUpdated" : "status.traitsCreated",);
      this.cancelEdit();
      await this.loadTraits();
    } catch (error) {
      log.error("Failed to save trait", error instanceof Error ? error : undefined, {},);
      this.error = t("status.traitsSaveFailed",);
    } finally {
      this.busy = false;
    }
  },

  async remove(traitName: string,) {
    const actorId = this._trActorId;
    if (!actorId || this.busy || !traitName) { return; }
    this.busy = true;
    this.error = "";
    try {
      const res = await apiFetch(
        `/api/actors/${actorId}/traits/${encodeURIComponent(traitName,)}`,
        { method: "DELETE", },
      );
      if (!res.ok && res.status !== 404) {
        this.error = t("status.traitsDeleteFailed",);
        return;
      }
      this.message = t("status.traitsDeleted",);
      if (this.draft.editingName === traitName) { this.cancelEdit(); }
      await this.loadTraits();
    } catch (error) {
      log.error("Failed to delete trait", error instanceof Error ? error : undefined, {},);
      this.error = t("status.traitsDeleteFailed",);
    } finally {
      this.busy = false;
    }
  },

  describeCategory(category: string,) {
    return CATEGORY_LABELS[category] ?? category;
  },
};

/** Build the Alpine scope for the permanent-traits panel. */
export function actorTraitsFactory(actorId: string,): ActorTraitsState {
  const state = Object.create(actorTraits,) as ActorTraitsState;
  state._trActorId = null;
  state.traits = [];
  state.traitsLoading = false;
  state.traitsError = "";
  state.search = "";
  state.categoryFilter = "";
  state.draft = emptyDraft();
  state.busy = false;
  state.message = "";
  state.error = "";
  state.setActorId(actorId,);
  void state.loadTraits();
  return state;
}

(globalThis as Record<string, unknown>).actorTraitsFactory = actorTraitsFactory;
