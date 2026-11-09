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
import { showToast, } from "../ui";
import { t, } from "./i18n";
import { log as rootLog, } from "./logger";
import { fetchWorldJson, } from "./world-fetch";

const log = rootLog.child({ module: "world-edit-modal", },);

/** The world values the Edit modal shows and submits. */
export interface WorldEditModalValues {
  name: string;
  description: string;
  lore: string;
}

/** The loaded world row - only the fields the modal edits are read. */
interface WorldEditModalRow {
  name?: string | null;
  description?: string | null;
  lore?: string | null;
}

/** Modal field id -> key of the loaded world row. */
const FIELD_IDS: readonly (readonly [string, keyof WorldEditModalValues,])[] = [
  ["#edit-name", "name",],
  ["#edit-description", "description",],
  ["#edit-lore", "lore",],
];

/**
 * Read the world id from the modal form's PUT target.
 *
 * The action is rendered by the server (the static partial substitutes
 * {{worldId}} into it), so the id is the last path segment. The id's shape
 * belongs to the API - it validates the path param, a bad id answers 404
 * and the modal stays unsaveable - so this reads the id out of the action
 * instead of re-checking what the route already validates.
 * @param root the modal root element
 * @returns the world id, or null when the form is missing or unexpected
 */
function worldIdFromForm(root: ParentNode,): string | null {
  const form = root.querySelector<HTMLFormElement>("#edit-world-form",);
  const action = form?.getAttribute("hx-put",) ?? "";
  return action.split("/",).pop() || null;
}

/**
 * Write the world's current values into the modal's fields.
 * @param root the modal root element
 * @param values the world's current values
 */
function fillFields(root: ParentNode, values: WorldEditModalValues,): void {
  for (const [selector, key,] of FIELD_IDS) {
    const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector,);
    if (!field) { continue; }
    field.value = values[key];
    field.dispatchEvent(new Event("input", { bubbles: true, },),);
  }
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
 * Report a failed load to the user (best effort - the toast container may
 * not be on the page).
 */
function notifyLoadFailed(): void {
  try {
    showToast("error", t("worlds.loadFailed",),);
  } catch (error) {
    log.warn("toast failed", { error: String(error,), },);
  }
}

/**
 * Load the world's current values into the modal's fields.
 * @param root the modal root element
 * @returns true when the fields were filled
 */
async function prefillWorldEditModal(root: ParentNode,): Promise<boolean> {
  try {
    const worldId = worldIdFromForm(root,);
    if (!worldId) {
      log.warn("no world id on the edit form",);
      notifyLoadFailed();
      return false;
    }

    const row = await fetchWorldJson<WorldEditModalRow>(worldId, "",);
    if (!row) {
      log.warn(`world ${worldId} could not be loaded`,);
      notifyLoadFailed();
      return false;
    }

    fillFields(root, {
      name: row.name ?? "",
      description: row.description ?? "",
      lore: row.lore ?? "",
    },);

    enableSave(root,);
    return true;
  } catch (error) {
    log.warn("prefill failed", { error: String(error,), },);
    notifyLoadFailed();
    return false;
  }
}

/** Alpine component for the world Edit modal. */
export interface WorldEditModalComponent {
  /** The modal root element (Alpine injects it). */
  $el?: HTMLElement;
  /** Load the world's current values into the modal's fields. */
  init(): Promise<void>;
}

/**
 * Alpine component for the world Edit modal - fills the fields with the
 * world's current values so saving never wipes them.
 * @returns the component data for `x-data`
 */
export function worldEditModal(): WorldEditModalComponent {
  return {
    async init(this: WorldEditModalComponent,): Promise<void> {
      const root = this.$el;
      if (!root) {
        log.warn("modal root element missing",);
        return;
      }

      await prefillWorldEditModal(root,);
    },
  };
}

(globalThis as unknown as Record<string, unknown>).worldEditModal = worldEditModal;
