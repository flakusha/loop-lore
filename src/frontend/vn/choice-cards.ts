// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Choice Cards
 *
 * Renders branching choice cards in VN mode and handles selection.
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
import { setChoicePending, } from "./pending-decision";

const LOCATION_CHANGED_EVENT = "chat:location-changed";

/** */
export interface VnChoice {
  id: string;
  chat_id: string;
  scene_index: number;
  choice_index: number;
  text: string;
  description: string | null;
  consequences: Record<string, unknown>;
  relationship_impact: Record<string, number>;
  mood_impact: Record<string, number>;
  unlock_conditions: Record<string, unknown>;
  selection_count: number;
  is_active: number;
  /** Populated from API on load: true when is_active === 1. */
  selected?: boolean;
  /** Display label derived from text on load. */
  label?: string;
}

/** Return type from selectChoice including location change result. */
export interface SelectChoiceResult {
  choice: VnChoice;
  locationId?: string;
  splitTriggered?: boolean;
  reunionTriggered?: boolean;
  locationChanged: boolean;
}

let choices: VnChoice[] = [];
let container: HTMLElement | null = null;
let chatId: string | null = null;
let sceneIndex = 0;

/**
 * Initialize the choice cards component.
 * @param containerEl
 * @param currentChatId
 * @param currentSceneIndex
 */
export function initChoiceCards(
  containerEl: HTMLElement,
  currentChatId: string,
  currentSceneIndex: number,
): void {
  container = containerEl;
  chatId = currentChatId;
  sceneIndex = currentSceneIndex;
}

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

  choices = choices.filter((c,) => c.id !== choiceId);
  setChoicePending(choices.some((c,) => !c.selected),);
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

/** Destroy the choice cards component. */
export function destroyChoiceCards(): void {
  // Leaving the flag set here would wedge the composer: the cards are gone, so
  // nothing can resolve the decision the gate is still waiting on.
  setChoicePending(false,);
  container = null;
  chatId = null;
  choices = [];
}

/**
 * Load choices for the current scene from the API.
 * @returns {Promise<void>}
 */
export async function loadChoices(): Promise<void> {
  if (!chatId) { return; }
  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/vn-choices?sceneIndex=${sceneIndex}`,);
    if (!res.ok) { return; }
    const data = await res.json();
    const raw: VnChoice[] = data.choices ?? data.data ?? [];
    choices = [];
    for (const c of raw) {
      choices.push({
        ...c,
        selected: c.selected === true || c.is_active === 1,
        label: c.label ?? c.text ?? "Untitled choice",
      },);
    }

    setChoicePending(choices.length > 0,);
    renderChoices();
  } catch {
    choices = [];
    setChoicePending(false,);
  }
}

/**
 * Select a choice, apply its effects, and trigger location/split/reunite
 * consequences via their dedicated endpoints.
 * @param choiceId
 * @returns SelectChoiceResult on success, null on failure.
 */
export async function selectChoice(choiceId: string,): Promise<SelectChoiceResult | null> {
  if (!chatId) { return null; }
  const idx = choices.findIndex((c,) => c.id === choiceId);
  if (idx === -1) { return null; }

  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/vn-choices/${choiceId}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ choiceId, },),
    },);

    if (!res.ok) { return null; }
    const data = await res.json();
    const { choice: returned, locationId, } = (data.choice ?? data.data) as { choice: VnChoice; locationId?: string };
    const returnedLabel = returned.label ?? returned.text ?? "Untitled choice";

    const updated = { ...returned, selected: true, label: returnedLabel, } as VnChoice;
    choices = Array.from(choices, (c, i,) => (i === idx ? updated : c),);
    // Only the picked choice stopped being 'available' server-side; siblings
    // are still resolvable, so the gate must stay closed while any remain.
    setChoicePending(choices.some((c,) => !c.selected),);

    let locationChanged = false;
    let splitTriggered = false;
    let reunionTriggered = false;

    if (locationId) {
      try {
        const locRes = await apiFetch(`/api/v1/chats/${chatId}/location`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ locationId, },),
        },);

        if (locRes.ok) {
          globalThis.dispatchEvent(
            new CustomEvent(LOCATION_CHANGED_EVENT, {
              detail: { chatId, locationId, locationName: null, },
            },),
          );

          locationChanged = true;
        }
      } catch {
        // Location change is best-effort; choice itself already persisted.
      }
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
    return null;
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

  for (const choice of choices) {
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
 * Internal: dispatch to renderChoices in ./choice-cards-render.ts
 */
function renderChoices(): void {
  if (!container) { return; }
  renderChoiceCards(
    container,
    choices,
    (id,) => void selectChoice(id,),
    (id,) => void skipChoice(id,),
  );
}
