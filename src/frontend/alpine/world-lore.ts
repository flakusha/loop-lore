// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World lore editor mixin for the world page (TASK-world-dashboard, lore
 * editor). Consumes the existing generic lore CRUD at
 * `/api/v1/worlds/:worldId/lore-entries` (src/routes/world-lore-entries.ts,
 * createEntityRoutes over `world_lore_entries`) — list / create (POST) /
 * update (PUT) / delete (DELETE). List rows are decoded through a TypeBox
 * response schema; keys arrive as a raw JSON string and are parsed for
 * display via {@link parseLoreKeys}.
 */
import { Type, } from "@sinclair/typebox";
import { parseRevealCondition, } from "../../assistant/lore/reveal-condition";
import { ItemRarity, } from "../../db/enums-story/items";
import { jsonStringifyOr, parseJsonList, } from "../../utils";
import { apiFetch, } from "./htmx";
import { parseOr, } from "./validation";
import { fetchWorldJson, } from "./world-fetch";
import type { WorldLoreEntry, WorldPageState, } from "./world-types";

/** Strict decoder for one lore list row. */
const LoreEntrySchema = Type.Object({
  id: Type.String(),
  name: Type.Union([Type.String(), Type.Null(),],),
  content: Type.String(),
  keys: Type.Union([Type.String(), Type.Null(),],),
  enabled: Type.String(),
  constant: Type.Union([Type.Number(), Type.Null(),],),
  priority: Type.Union([Type.Number(), Type.Null(),],),
  comment: Type.Union([Type.String(), Type.Null(),],),
  revealCondition: Type.Optional(Type.Union([Type.String(), Type.Null(),],),),
  timelineId: Type.Optional(Type.Union([Type.String(), Type.Null(),],),),
  rarity: Type.Optional(Type.Union([Type.String(), Type.Null(),],),),
},);

/** Strict decoder for the paginated lore list body. */
const LoreListSchema = Type.Object({ data: Type.Array(LoreEntrySchema,), },);

const EMPTY_FORM = {
  name: "",
  keys: "",
  content: "",
  priority: "100",
  constant: false,
  revealCondition: "",
  rarity: ItemRarity.Common,
  timelineId: "",
};

/** Rarity tiers for the editor dropdown — canonical ItemRarity scale. */
export const LORE_RARITY_TIERS: readonly string[] = Object.values(ItemRarity,);

/**
 * Client-side reveal-condition validation, mirroring the server write guard
 * (`lore-entry-values.ts` → `parseRevealCondition`): the lore section fails
 * closed on unparsable conditions, so a typo would hide the secret forever.
 * @param raw textarea content (stored JSON text form)
 * @returns {boolean} true when blank or a valid reveal-condition tree
 */
export function isValidRevealCondition(raw: string,): boolean {
  const trimmed = raw.trim();
  if (trimmed === "") { return true; } // blank = not secret = nothing to validate
  return parseRevealCondition(trimmed,) !== null;
}

/**
 * Parse the stored keys JSON string into a display list.
 * @param raw raw `keys` column value (JSON array string or null)
 * @returns {string[]}
 */
export function parseLoreKeys(raw: string | null | undefined,): string[] {
  return parseJsonList(raw,);
}

/**
 * Group lore entries for the editor: always-on constants first, then
 * enabled entries, then disabled ones.
 * @param entries decoded lore rows
 * @returns {WorldPageState["loreGroups"]}
 */
export function groupLoreEntries(entries: WorldLoreEntry[],): WorldPageState["loreGroups"] {
  const groups: WorldPageState["loreGroups"] = { constant: [], enabled: [], disabled: [], };
  for (const entry of entries) {
    if (entry.constant === 1) { groups.constant.push(entry,); }
    else if (entry.enabled === "enabled") { groups.enabled.push(entry,); }
    else { groups.disabled.push(entry,); }
  }

  return groups;
}

/**
 * Reveal-condition editor error, or "" when blank/valid. Mirrors the server
 * write guard — the lore section fails closed on unparsable conditions, so a
 * typo would hide the secret forever.
 * @param raw textarea content (stored JSON text form)
 * @returns {string}
 */
function revealConditionError(raw: string,): string {
  const trimmed = raw.trim();
  if (trimmed === "") { return ""; }
  return isValidRevealCondition(trimmed,) ? "" : "Reveal condition is not valid reveal-condition JSON.";
}

/**
 * Build the create/update API payload from the editor form. Blank optional
 * fields are omitted (undefined) so create uses column defaults and update
 * leaves the stored value untouched.
 * @param form editor form state
 * @returns {Record<string, unknown>}
 */
function lorePayload(form: WorldPageState["loreForm"],): Record<string, unknown> {
  const revealCondition = form.revealCondition.trim();
  return {
    name: form.name.trim() || undefined,
    content: form.content,
    keys: parseLoreKeys(jsonStringifyOr(
      form.keys.split(",",).map((k,) => k.trim()).filter((k,) => k.length > 0),
    ),),
    priority: Number(form.priority,) || 100,
    constant: form.constant ? 1 : 0,
    enabled: "enabled",
    revealCondition: revealCondition === "" ? undefined : revealCondition,
    rarity: form.rarity || undefined,
    timelineId: form.timelineId.trim() || undefined,
  };
}

/** Lore list + editor state for the world page. */
export const worldLore: Partial<WorldPageState> & ThisType<WorldPageState> = {
  loreEntries: [],
  loreLoading: false,
  loreError: false,
  loreFormOpen: false,
  loreEditingId: null,
  loreBusy: false,
  loreMessage: "",
  loreFormError: "",
  loreForm: { ...EMPTY_FORM, },

  /** @returns {Promise<void>} */
  async loadLore() {
    this.loreLoading = true;
    this.loreError = false;
    try {
      const body = await fetchWorldJson<unknown>(this.worldId, "/lore-entries?pageSize=500",);
      if (body !== null) {
        this.loreEntries = parseOr(LoreListSchema, body, { data: [], },).data;
      } else {
        this.loreError = true;
      }
    } catch {
      this.loreError = true;
    } finally {
      this.loreLoading = false;
    }
  },

  /**
   * Open the editor form, blank for create or filled from an entry.
   * @param {string | null} id entry id, or null for a new entry
   * @returns {void}
   */
  openLoreForm(id: string | null,) {
    this.loreMessage = "";
    this.loreFormError = "";
    const entry = id ? this.loreEntries.find((e,) => e.id === id) : undefined;
    this.loreEditingId = entry?.id ?? null;
    this.loreForm = entry
      ? {
        name: entry.name ?? "",
        keys: parseLoreKeys(entry.keys,).join(", ",),
        content: entry.content,
        priority: String(entry.priority ?? 100,),
        constant: entry.constant === 1,
        revealCondition: entry.revealCondition ?? "",
        rarity: entry.rarity ?? ItemRarity.Common,
        timelineId: entry.timelineId ?? "",
      }
      : { ...EMPTY_FORM, };

    this.loreFormOpen = true;
  },

  /** @returns {void} */
  cancelLoreForm() {
    this.loreFormOpen = false;
    this.loreEditingId = null;
    this.loreFormError = "";
    this.loreForm = { ...EMPTY_FORM, };
  },

  /** @returns {Promise<void>} */
  async saveLore() {
    if (!this.loreForm.content.trim()) {
      this.loreMessage = "Content is required.";
      return;
    }

    const revealError = revealConditionError(this.loreForm.revealCondition,);
    if (revealError !== "") {
      this.loreFormError = revealError;
      return;
    }

    this.loreBusy = true;
    this.loreMessage = "";
    this.loreFormError = "";
    try {
      const payload = lorePayload(this.loreForm,);

      const url = this.loreEditingId
        ? `/api/v1/worlds/${this.worldId}/lore-entries/${this.loreEditingId}`
        : `/api/v1/worlds/${this.worldId}/lore-entries`;

      const res = await apiFetch(url, {
        method: this.loreEditingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonStringifyOr(payload,),
      },);

      if (res.ok) {
        this.cancelLoreForm();
        await this.loadLore();
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        this.loreMessage = err.error ?? "Save failed";
      }
    } catch {
      this.loreMessage = "Network error";
    } finally {
      this.loreBusy = false;
    }
  },

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteLore(id: string,) {
    this.loreBusy = true;
    try {
      const res = await apiFetch(`/api/v1/worlds/${this.worldId}/lore-entries/${id}`, {
        method: "DELETE",
      },);

      if (res.ok || res.status === 204) {
        await this.loadLore();
      } else {
        this.loreMessage = "Delete failed";
      }
    } catch {
      this.loreMessage = "Network error";
    } finally {
      this.loreBusy = false;
    }
  },

  /** @returns {WorldPageState["loreGroups"]} */
  get loreGroups(): WorldPageState["loreGroups"] {
    return groupLoreEntries(this.loreEntries,);
  },

  /** @returns {readonly string[]} */
  get loreRarityTiers(): readonly string[] {
    return LORE_RARITY_TIERS;
  },

  parseLoreKeys,
};
