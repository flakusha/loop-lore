// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 258

/**
 * VN Choice Cards
 *
 * Renders branching choice cards in VN mode and handles selection.
 */
import { apiFetch, } from "../alpine/htmx";
import { jsonBody, } from "../alpine/json";
import { feFetch, } from "../fe-fetch";
import { renderChoiceCards, } from "./choice-cards-render";

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
 * Destroy the choice cards component.
 */
export function destroyChoiceCards(): void {
  container = null;
  chatId = null;
  choices = [];
}

/**
 * Load choices for the current scene from the API.
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
        selected: c.selected === 1 || c.selected === true || c.is_active === 1,
        label: c.label ?? c.text ?? "Untitled choice",
      },);
    }
    renderChoices();
  } catch {
    choices = [];
  }
}

/**
 * Detect a split consequence: { action: "split", branches: [...] }
 * @param consequences
 */
function extractSplitBranches(
  consequences: Record<string, unknown>,
): { locationId: string; actorIds: string[] }[] | null {
  const action = consequences.action;
  const branches = consequences.branches;
  if (action !== "split" || !Array.isArray(branches,)) { return null; }
  const out: { locationId: string; actorIds: string[] }[] = [];
  for (const b of branches) {
    if (!b || typeof b !== "object") { continue; }
    const rec = b as Record<string, unknown>;
    const locationId = rec.locationId;
    const actorIds = rec.actorIds;
    if (typeof locationId !== "string" || !Array.isArray(actorIds,)) { continue; }
    const ids: string[] = [];
    for (const id of actorIds) {
      if (typeof id === "string") { ids.push(id,); }
    }
    if (ids.length === 0) { continue; }
    out.push({ locationId, actorIds: ids, },);
  }
  return out.length >= 2 ? out : null;
}

/**
 * Detect a reunion consequence: { action: "reunite", secondaryChatId }
 * @param consequences
 */
function extractReunionSource(consequences: Record<string, unknown>,): string | null {
  if (consequences.action !== "reunite") { return null; }
  const id = consequences.secondaryChatId;
  return typeof id === "string" ? id : null;
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
      try {
        const splitRes = await feFetch(`/api/chats/${chatId}/split`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ branches: splitBranches, },),
        },);
        splitTriggered = splitRes.ok;
      } catch {
        splitTriggered = false;
      }
    }

    const reunionSource = extractReunionSource(returned.consequences,);
    if (reunionSource) {
      try {
        const reuniteRes = await feFetch(`/api/chats/${chatId}/reunite`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ secondaryChatId: reunionSource, },),
        },);
        reunionTriggered = reuniteRes.ok;
      } catch {
        reunionTriggered = false;
      }
    }

    return { choice: returned, locationId, splitTriggered, reunionTriggered, locationChanged, };
  } catch {
    return null;
  }
}

/**
 * Get the relationship and mood impacts from all selected choices.
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
  renderChoiceCards(container, choices, (id,) => void selectChoice(id,),);
}
