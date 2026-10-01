// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 270

// ── Character-sheet wardrobe manager panel.
// Drives:
//   GET    /api/v1/actors/:actorId/wardrobe
//   POST   /api/v1/actors/:actorId/wardrobe
//   PUT    /api/v1/actors/:actorId/wardrobe/:itemId
//   DELETE /api/v1/actors/:actorId/wardrobe/:itemId
//   GET    /api/v1/actors/:actorId/avatars   (variant grid source)
// Pairs with `src/components/character/wardrobe-panel.html`.
import type {
  ActorWardrobeState,
  OutfitDraft,
  WardrobeOutfit,
  WardrobeVariant,
} from "./actor-wardrobe-types";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

export type {
  ActorWardrobeState,
  OutfitDraft,
  WardrobeOutfit,
  WardrobeVariant,
} from "./actor-wardrobe-types";

const log = rootLog.child({ module: "actor-wardrobe", },);

const emptyDraft = (): OutfitDraft => ({
  name: "",
  descriptor: "",
  tagsInput: "",
  editingId: null,
});

/** Split the comma-separated tag input into trimmed non-empty tags. */
export function parseTagsInput(input: string,): string[] {
  return input.split(",",).map((tag,) => tag.trim(),).filter((tag,) => tag.length > 0,);
}

export const actorWardrobe: ActorWardrobeState = {
  _wActorId: null,
  outfits: [],
  variants: [],
  loading: false,
  loadError: "",
  draft: emptyDraft(),
  busy: false,
  message: "",
  error: "",

  setActorId(actorId: string,) {
    if (this._wActorId === actorId) { return; }
    this._wActorId = actorId;
    this.outfits = [];
    this.variants = [];
    this.loadError = "";
    this.message = "";
    this.error = "";
    this.draft = emptyDraft();
  },

  async load() {
    const actorId = this._wActorId;
    if (!actorId) { return; }
    this.loading = true;
    this.loadError = "";
    try {
      const [itemsRes, avatarsRes,] = await Promise.all([
        apiFetch(`/api/v1/actors/${actorId}/wardrobe`,),
        apiFetch(`/api/v1/actors/${actorId}/avatars`,),
      ]);
      if (!itemsRes.ok) {
        this.loadError = t("status.wardrobeLoadFailed",);
        return;
      }
      this.outfits = (await itemsRes.json()) as WardrobeOutfit[];
      if (avatarsRes.ok) {
        this.variants = (await avatarsRes.json()) as WardrobeVariant[];
      } else {
        this.variants = [];
      }
    } catch (error) {
      log.error("Failed to load wardrobe", error instanceof Error ? error : undefined, {},);
      this.loadError = t("status.wardrobeLoadFailed",);
    } finally {
      this.loading = false;
    }
  },

  startEdit(outfit: WardrobeOutfit,) {
    this.draft = {
      name: outfit.name,
      descriptor: outfit.descriptor,
      tagsInput: outfit.tags.join(", ",),
      editingId: outfit.id,
    };
  },

  cancelEdit() {
    this.draft = emptyDraft();
  },

  async save() {
    const actorId = this._wActorId;
    if (!actorId) { return; }
    const name = this.draft.name.trim();
    if (!name) {
      this.error = t("status.wardrobeNameRequired",);
      return;
    }
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const payload = {
        name,
        descriptor: this.draft.descriptor.trim(),
        tags: parseTagsInput(this.draft.tagsInput,),
      };
      const editingId = this.draft.editingId;
      const url = editingId
        ? `/api/v1/actors/${actorId}/wardrobe/${editingId}`
        : `/api/v1/actors/${actorId}/wardrobe`;
      const res = await apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(payload,),
      },);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}),)) as { message?: string };
        this.error = body.message ?? t("status.wardrobeSaveFailed",);
        return;
      }
      this.message = editingId ? t("status.wardrobeUpdated",) : t("status.wardrobeCreated",);
      this.draft = emptyDraft();
      await this.load();
    } catch (error) {
      log.error("Failed to save outfit", error instanceof Error ? error : undefined, {},);
      this.error = t("status.wardrobeSaveFailed",);
    } finally {
      this.busy = false;
    }
  },

  async remove(outfitId: string,) {
    const actorId = this._wActorId;
    if (!actorId) { return; }
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/wardrobe/${outfitId}`, { method: "DELETE", },);
      if (!res.ok && res.status !== 404) {
        this.error = t("status.wardrobeDeleteFailed",);
        return;
      }
      if (this.draft.editingId === outfitId) { this.draft = emptyDraft(); }
      await this.load();
    } catch (error) {
      log.error("Failed to delete outfit", error instanceof Error ? error : undefined, {},);
      this.error = t("status.wardrobeDeleteFailed",);
    } finally {
      this.busy = false;
    }
  },

  variantGrid() {
    const nameById = new Map(this.outfits.map((o,) => [o.id, o.name,],),);
    const groups = new Map<string | null, WardrobeVariant[]>();
    for (const variant of this.variants) {
      const key = variant.outfitId ?? null;
      const bucket = groups.get(key);
      if (bucket) { bucket.push(variant,); } else { groups.set(key, [variant,],); }
    }
    return Array.from(groups.entries(),)
      .map(([outfitId, variants,]) => ({
        outfitId,
        outfitName: outfitId === null
          ? t("wardrobe.baseOutfit",)
          : nameById.get(outfitId) ?? outfitId,
        variants,
      }),)
      .sort((a, b,) => a.outfitName.localeCompare(b.outfitName,),);
  },
};

/** Build the Alpine scope for the wardrobe manager panel. */
export function actorWardrobeFactory(actorId: string,): ActorWardrobeState {
  const state = Object.create(actorWardrobe,) as ActorWardrobeState;
  state.setActorId(actorId,);
  return state;
}

(globalThis as Record<string, unknown>).actorWardrobeFactory = actorWardrobeFactory;
(globalThis as Record<string, unknown>).actorWardrobe = actorWardrobe;
