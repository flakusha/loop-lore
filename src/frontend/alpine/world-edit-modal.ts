// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World Edit modal (src/partials/worlds/edit-modal.html).
 *
 * The modal is served as a STATIC partial - it holds no database handle, so
 * its fields arrive blank and saving it as-is wiped the world's description
 * and lore. This component loads the world's current values from the
 * access-checked GET /api/v1/worlds/:id and writes them into the fields.
 *
 * The Save button ships disabled and is only enabled once the values are
 * loaded, so a world that cannot be loaded can never be submitted empty.
 *
 * The read is access-checked server-side (requireWorldAccess): the modal
 * renders what the API returned and never decides access itself - a denied
 * read fails closed, with Save left disabled.
 */
import { Type, } from "@sinclair/typebox";
import { showToast, } from "../ui";
import { t, } from "./i18n";
import { log as rootLog, } from "./logger";
import { parseOr, } from "./validation";
import { fetchWorldJson, } from "./world-fetch";

const log = rootLog.child({ module: "world-edit-modal", },);

/** The world values the Edit modal shows and submits. */
export interface WorldEditModalValues {
  name: string;
  description: string;
  lore: string;
}

/**
 * The world's row as GET /api/v1/worlds/:id serves it, limited to the fields
 * the modal edits.
 *
 * The route answers with the raw `worlds` row, so the two text columns are
 * nullable on the wire (a world with no description serves `null`). The
 * check is strict on purpose: a row that does not match leaves the modal
 * unsaveable (the load fails closed) instead of filling the fields with
 * guesses - a half-filled form is what wiped the world's text.
 */
const WorldRowSchema = Type.Union([
  Type.Object({
    name: Type.String(),
    description: Type.Union([Type.String(), Type.Null(),],),
    lore: Type.Union([Type.String(), Type.Null(),],),
  },),
  Type.Null(),
],);

/** Modal field id -> key of the loaded world row. */
const FIELD_IDS: readonly (readonly [string, keyof WorldEditModalValues,])[] = [
  ["#edit-name", "name",],
  ["#edit-description", "description",],
  ["#edit-lore", "lore",],
];

/** The API path the modal form PUTs to - the world id follows it. */
const WORLD_API_PREFIX = "/api/v1/worlds/";

/**
 * Read the world id from the modal form's PUT target.
 *
 * The action is rendered by the server (the static partial substitutes
 * {{worldId}} into it), so the id is everything after the known API prefix.
 * The id's shape belongs to the API - it validates the path param, a bad id
 * answers 404 and the modal stays unsaveable - so this reads the id out of
 * the action instead of re-checking what the route already validates. It
 * does NOT take the last path segment: an id carrying "/" would yield a
 * different id than the one the form targets, and the modal would fill
 * itself with another world's values.
 * @param root the modal root element
 * @returns the world id, or null when the form is missing or unexpected
 */
function worldIdFromForm(root: ParentNode,): string | null {
  const form = root.querySelector<HTMLFormElement>("#edit-world-form",);
  const action = form?.getAttribute("hx-put",) ?? "";
  if (!action.startsWith(WORLD_API_PREFIX,)) { return null; }
  return action.slice(WORLD_API_PREFIX.length,) || null;
}

/**
 * Write the world's current values into the modal's fields.
 * Loaded values only fill fields the user has not touched yet (a field
 * holding typed text is left alone): the user's text wins, and untouched
 * fields still get their loaded values, so an untouched save submits the
 * world's own values instead of wiping them.
 * @param root the modal root element
 * @param values the world's current values
 * @returns true when every field was present and filled or already typed
 */
export function fillFields(root: ParentNode, values: WorldEditModalValues,): boolean {
  let complete = true;
  for (const [selector, key,] of FIELD_IDS) {
    const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector,);
    if (!field) {
      complete = false;

      continue;
    }

    // Skip fields the user already typed into - their text wins over the load.
    if (field.value !== "") {
      continue;
    }

    field.value = values[key];
    field.dispatchEvent(new Event("input", { bubbles: true, },),);
  }

  return complete;
}

/**
 * Enable the modal's Save button - it ships disabled so an unloaded world
 * can never be submitted empty.
 * @param root the modal root element
 */
function enableSave(root: ParentNode,): void {
  const save = root.querySelector<HTMLButtonElement>("#edit-world-save",);
  if (save) { save.disabled = false; }
}

/**
 * Report a failed load to the user. showToast never throws (it returns
 * early when the toast container is absent), so no try/catch here.
 */
function notifyLoadFailed(): void {
  showToast("error", t("worlds.loadFailed",),);
  log.warn("world failed to load",);
}

/**
 * Load the world's current values into the modal's fields.
 * @param root the modal root element
 * @param store optional component state updated with the load outcome
 * (loadError reflects whether the fields hold the world's values)
 * @returns true when the fields were filled
 */
export async function prefillWorldEditModal(root: ParentNode, store?: { loadError: boolean },): Promise<boolean> {
  const fail = (): false => {
    if (store) { store.loadError = true; }
    notifyLoadFailed();

    return false;
  };

  try {
    const worldId = worldIdFromForm(root,);
    if (!worldId) {
      log.warn("no world id on the edit form",);
      return fail();
    }

    const raw = await fetchWorldJson<unknown>(worldId, "",);
    if (raw === null) {
      log.warn(`world ${worldId} could not be loaded`,);
      return fail();
    }

    // The row is decoded through the shared schema before any field is
    // read: an unexpected shape leaves the modal unsaveable instead of
    // filling the fields with guesses.
    const row = parseOr(WorldRowSchema, raw, null,);
    if (!row) {
      log.warn(`world ${worldId} did not match the expected shape`,);
      return fail();
    }

    const complete = fillFields(root, {
      name: row.name,
      description: row.description ?? "",
      lore: row.lore ?? "",
    },);

    if (!complete) {
      // A missing field would submit "" and wipe the column, so an
      // incomplete fill is a failed load: toast, Save stays disabled.
      log.warn(`world ${worldId} modal is missing a field`,);
      return fail();
    }

    if (store) { store.loadError = false; }
    enableSave(root,);
    return true;
  } catch (error) {
    log.warn("prefill failed", { error: String(error,), },);
    return fail();
  }
}

/** Alpine component for the world Edit modal. */
export interface WorldEditModalComponent {
  /** The modal root element (Alpine injects it). */
  $el?: HTMLElement;
  /** True while the last load failed to fill the fields. */
  loadError: boolean;
  /** Load the world's current values into the modal's fields. */
  init(): Promise<void>;
  /** Re-run the load after a failure (the Retry button). */
  retry(): Promise<void>;
}

/**
 * Alpine component for the world Edit modal - fills the fields with the
 * world's current values so saving never wipes them.
 * @returns the component data for `x-data`
 */
export function worldEditModal(): WorldEditModalComponent {
  return {
    loadError: false,
    async init(this: WorldEditModalComponent,): Promise<void> {
      const root = this.$el;
      if (!root) {
        log.warn("modal root element missing",);
        return;
      }

      await prefillWorldEditModal(root, this,);
    },
    async retry(this: WorldEditModalComponent,): Promise<void> {
      const root = this.$el;
      if (!root) {
        log.warn("modal root element missing",);
        return;
      }

      await prefillWorldEditModal(root, this,);
    },
  };
}

(globalThis as unknown as Record<string, unknown>).worldEditModal = worldEditModal;
