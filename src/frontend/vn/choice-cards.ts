// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Choice Cards
 *
 * Renders branching choice cards in VN mode and handles selection.
 */
import { apiFetch, } from "../alpine/htmx";
import { jsonBody, } from "../alpine/json";
import { feFetch, } from "../fe-fetch";

const LOCATION_CHANGED_EVENT = "chat:location-changed";

export interface VnChoice {
  id: string;
  chat_id: string;
  scene_index: number;
  label: string;
  description: string | null;
  consequences: Record<string, unknown>;
  relationship_impact: Record<string, number>;
  mood_impact: Record<string, number>;
  unlock_conditions: Record<string, unknown>;
  selected: number;
  selected_at: string | null;
  created_at: string;
}

/** Return type from selectChoice including location change result. */
export interface SelectChoiceResult {
  choice: VnChoice;
  locationId?: string;
  locationChanged: boolean;
}

let choices: VnChoice[] = [];
let container: HTMLElement | null = null;
let chatId: string | null = null;
let sceneIndex = 0;

/**
 * Initialize the choice cards component.
 */
export function initChoiceCards(
  containerEl: HTMLElement,
  currentChatId: string,
  currentSceneIndex: number,
): void {
  container = containerEl;
  chatId = currentChatId;
  sceneIndex = currentSceneIndex;
  choices = [];
  renderChoices();
}

/**
 * Destroy the choice cards component.
 */
export function destroyChoiceCards(): void {
  container = null;
  choices = [];
}

/**
 * Load choices for the current scene from the API.
 */
export async function loadChoices(): Promise<void> {
  if (!chatId || !container) {
    return;
  }

  try {
    const res = await feFetch(`/api/chats/${chatId}/vn-choices?sceneIndex=${sceneIndex}`,);
    if (res.ok) {
      const data = await res.json();
      choices = data.data.choices ?? [];
      renderChoices();
    }
  } catch {
    // Non-critical — choices just won't show
  }
}

/**
 * Select a choice, apply its effects, and trigger a location change if the
 * choice has a location consequence.
 *
 * @returns SelectChoiceResult on success, null on failure.
 */
export async function selectChoice(choiceId: string,): Promise<SelectChoiceResult | null> {
  if (!chatId) {
    return null;
  }

  try {
    const res = await feFetch(`/api/chats/${chatId}/vn-choices/${choiceId}/select`, {
      method: "POST",
    },);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const { choice, locationId, } = data.data as { choice: VnChoice; locationId?: string };

    // Update local choice state
    choices = Array.from(
      choices,
      (c,) => c.id === choiceId ? { ...c, selected: 1, selected_at: choice.selected_at, } : c,
    );
    renderChoices();

    // Trigger location change if this choice moves the party
    let locationChanged = false;
    if (locationId && chatId) {
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
        // Location change is best-effort — don't fail the choice selection
      }
    }

    return { choice, locationId, locationChanged, };
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

// ── Internal ────────────────────────────────────────────────────────────────

function renderChoices(): void {
  if (!container) {
    return;
  }

  const available: VnChoice[] = [];
  const selected: VnChoice[] = [];
  for (const c of choices) {
    if (c.selected) {
      selected.push(c,);
    } else {
      available.push(c,);
    }
  }

  container.replaceChildren();

  const choiceList = document.createElement("div",);
  choiceList.className = "vn-choice-list";

  const renderCard = (choice: VnChoice, isSelected: boolean,) => {
    const card = document.createElement("button",);
    card.className = `vn-choice-card${isSelected ? " vn-choice-card--selected" : ""}`;
    card.type = "button";

    const label = document.createElement("span",);
    label.className = "vn-choice-card__label";
    label.textContent = choice.label;
    card.append(label,);

    if (choice.description) {
      const desc = document.createElement("span",);
      desc.className = "vn-choice-card__desc";
      desc.textContent = choice.description;
      card.append(desc,);
    }

    if (isSelected) {
      card.setAttribute("aria-selected", "true",);
    }

    return card;
  };

  for (const c of available) {
    const card = renderCard(c, false,);
    card.addEventListener("click", () => {
      void selectChoice(c.id,);
    },);
    choiceList.append(card,);
  }

  for (const c of selected) {
    const card = renderCard(c, true,);
    card.disabled = true;
    choiceList.append(card,);
  }

  container.append(choiceList,);
}
