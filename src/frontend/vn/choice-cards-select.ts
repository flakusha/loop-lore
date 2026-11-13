// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN choice-card resolution.
 *
 * Everything that acts on a card once it exists: selecting, skipping,
 * submitting a typed custom action, folding the server's returned card into
 * local state, and the location/split/reunite consequences those actions
 * trigger. Owns the re-render bridge so the resolution path never reaches
 * back into the hydration module (`choice-cards.ts`).
 */
import { apiFetch, } from "../alpine/htmx";
import { t, } from "../alpine/i18n";
import { jsonBody, } from "../alpine/json";
import {
  extractReunionSource,
  extractSplitBranches,
  triggerReunite,
  triggerSplit,
} from "./choice-cards-consequences";
import { renderChoiceCards, } from "./choice-cards-render";
import {
  getChatId,
  getChoices,
  getContainer,
  getSceneIndex,
  type SelectChoiceResult,
  setChoices,
  syncPendingGate,
  type VnChoice,
} from "./choice-cards-state";

const LOCATION_CHANGED_EVENT = "chat:location-changed";

/**
 * Skip a pending choice — the escape hatch out of the VN decision gate.
 *
 * Server-side this sets `status='dismissed'` (see `dismissVnChoice`); client
 * side we drop the row so the card disappears rather than showing a permanent
 * "skipped" state that the server no longer returns on the next load.
 * @param choiceId
 * @returns {Promise<boolean>} true when the skip was accepted.
 */
export async function skipChoice(choiceId: string,): Promise<boolean> {
  const chatId = getChatId();
  if (!chatId) {
    reportSkipFailure();

    return false;
  }

  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/vn-choices/${choiceId}/dismiss`, {
      method: "POST",
    },);

    if (!res.ok) {
      reportSkipFailure();

      return false;
    }
  } catch {
    reportSkipFailure();

    return false;
  }

  setChoices(getChoices().filter((c,) => c.id !== choiceId),);
  syncPendingGate();
  renderChoices();

  return true;
}

/**
 * A rejected skip leaves the row `available` server-side, so the flag stays set
 * and the gate keeps 409ing. Without this toast the only recovery is a full
 * page reload, which reads as "the button is broken".
 */
function reportSkipFailure(): void {
  document.dispatchEvent(
    new CustomEvent("show-toast", {
      detail: { type: "error", message: t("toasts.vnSkipFailed",), },
    },),
  );
}

/**
 * Apply a location consequence: best-effort PUT of the chat's location plus
 * the change event the scene listens for.
 * @param locationId
 * @returns true when the chat's location actually changed.
 */
async function applyLocationConsequence(locationId: string,): Promise<boolean> {
  const chatId = getChatId();
  if (!chatId) { return false; }

  try {
    const locRes = await apiFetch(`/api/v1/chats/${chatId}/location`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ locationId, },),
    },);

    if (!locRes.ok) { return false; }

    globalThis.dispatchEvent(
      new CustomEvent(LOCATION_CHANGED_EVENT, {
        detail: { chatId, locationId, locationName: null, },
      },),
    );

    return true;
  } catch {
    // Location change is best-effort; the choice itself already persisted.
    return false;
  }
}

/**
 * Select a choice, apply its effects, and trigger location/split/reunite
 * consequences via their dedicated endpoints.
 * @param choiceId
 * @returns SelectChoiceResult on success, null on failure.
 */
export async function selectChoice(choiceId: string,): Promise<SelectChoiceResult | null> {
  const chatId = getChatId();
  if (!chatId) { return null; }
  const choices = getChoices();
  const idx = choices.findIndex((c,) => c.id === choiceId);
  if (idx === -1) { return null; }

  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/vn-choices/${choiceId}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ choiceId, },),
    },);

    if (!res.ok) {
      document.dispatchEvent(
        new CustomEvent("show-toast", { detail: { type: "error", message: "Failed to select choice", }, },),
      );

      return null;
    }

    const data = await res.json();
    const { choice: returned, locationId, } = (data.choice ?? data.data) as { choice: VnChoice; locationId?: string };
    const returnedLabel = returned.label ?? returned.text ?? "Untitled choice";

    const updated = { ...returned, selected: true, label: returnedLabel, } as VnChoice;
    setChoices(Array.from(choices, (c, i,) => (i === idx ? updated : c),),);
    // Only the picked choice stopped being 'available' server-side; siblings
    // are still resolvable, so the gate must stay closed while any remain.
    syncPendingGate();

    let locationChanged = false;
    let splitTriggered = false;
    let reunionTriggered = false;

    if (locationId) {
      locationChanged = await applyLocationConsequence(locationId,);
    }

    // Phase 4: split/reunite consequences on choice cards.
    const splitBranches = extractSplitBranches(returned.consequences,);
    if (splitBranches) {
      splitTriggered = await triggerSplit(chatId, splitBranches,);
    }

    const reunionSource = extractReunionSource(returned.consequences,);
    if (reunionSource) {
      reunionTriggered = await triggerReunite(chatId, reunionSource,);
    }

    return { choice: returned, locationId, splitTriggered, reunionTriggered, locationChanged, };
  } catch {
    document.dispatchEvent(
      new CustomEvent("show-toast", { detail: { type: "error", message: "Failed to select choice", }, },),
    );

    return null;
  }
}

/**
 * Submit a typed action as the player's decision: the server creates a
 * custom `vn_choices` row (`"provenance": "custom"` in its consequences) and
 * selects it through the standard single-shot path, then this folds the
 * returned card into the local state exactly like `selectChoice` does.
 * @param freeText - the player's typed action; trimmed and capped server-side.
 * @returns true when the typed action was created and selected.
 */
export async function submitCustomChoice(freeText: string,): Promise<boolean> {
  const chatId = getChatId();
  if (!chatId) { return false; }

  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/vn-choices/custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ freeText, sceneIndex: getSceneIndex(), },),
    },);

    if (!res.ok) {
      document.dispatchEvent(
        new CustomEvent("show-toast", { detail: { type: "error", message: "Failed to select choice", }, },),
      );

      return false;
    }

    const data = await res.json() as { choice?: VnChoice; locationId?: string };
    const returned = data.choice;
    if (!returned) { return false; }

    const returnedLabel = returned.label ?? returned.text ?? "Custom action";
    setChoices([...getChoices(), { ...returned, selected: true, label: returnedLabel, } as VnChoice,],);
    // The typed card resolved itself; siblings stay available server-side, so
    // the gate stays closed while any remain — same rule as a card pick.
    syncPendingGate();

    if (data.locationId) {
      await applyLocationConsequence(data.locationId,);
    }

    renderChoices();

    return true;
  } catch {
    document.dispatchEvent(
      new CustomEvent("show-toast", { detail: { type: "error", message: "Failed to select choice", }, },),
    );

    return false;
  }
}

/**
 * Get the relationship and mood impacts from all selected choices.
 * @returns {{ relationships: Record<string, number>; moods: Record<string, number>; }}
 */
export function getAccumulatedImpacts(): {
  relationships: Record<string, number>;
  moods: Record<string, number>;
} {
  const relationships: Record<string, number> = {};
  const moods: Record<string, number> = {};

  for (const choice of getChoices()) {
    if (!choice.selected) {
      continue;
    }

    for (const [key, value,] of Object.entries(choice.relationship_impact,)) {
      relationships[key] = (relationships[key] ?? 0) + value;
    }

    for (const [key, value,] of Object.entries(choice.mood_impact,)) {
      moods[key] = (moods[key] ?? 0) + value;
    }
  }

  return { relationships, moods, };
}

/**
 * Internal: dispatch to renderChoiceCards in ./choice-cards-render.ts
 */
export function renderChoices(): void {
  const container = getContainer();
  if (!container) { return; }
  renderChoiceCards(
    container,
    getChoices(),
    (id,) => void selectChoice(id,),
    (id,) => void skipChoice(id,),
    (text,) => void submitCustomChoice(text,),
  );
}
