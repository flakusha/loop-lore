/**
 * VN Choice Cards
 *
 * Renders branching choice cards in VN mode and handles selection.
 */

import { feFetch, } from "../fe-fetch";

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
  if (!chatId || !container) { return; }

  try {
    const res = await feFetch(`/api/chats/${chatId}/vn-choices?sceneIndex=${sceneIndex}`,);
    if (res.ok) {
      const data = await res.json();
      choices = data.data || [];
      renderChoices();
    }
  } catch {
    // Non-critical — choices just won't show
  }
}

/**
 * Select a choice and apply its effects.
 */
export async function selectChoice(choiceId: string,): Promise<VnChoice | null> {
  if (!chatId) { return null; }

  try {
    const res = await feFetch(`/api/chats/${chatId}/vn-choices/${choiceId}/select`, {
      method: "POST",
    },);

    if (res.ok) {
      const data = await res.json();
      const selected = data.data;
      choices = Array.from(
        choices,
        (c,) => c.id === choiceId ? { ...c, selected: 1, selected_at: selected.selected_at, } : c,
      );
      renderChoices();
      return selected;
    }
  } catch {
    // Non-critical
  }

  return null;
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
    if (!choice.selected) { continue; }

    for (const [key, value,] of Object.entries(choice.relationship_impact,)) {
      relationships[key] = (relationships[key] ?? 0) + value;
    }

    for (const [key, value,] of Object.entries(choice.mood_impact,)) {
      moods[key] = (moods[key] ?? 0) + value;
    }
  }

  return { relationships, moods, };
}

// ── Internal ─────────────────────────────────────────────────

function renderChoices(): void {
  if (!container) { return; }

  const available: VnChoice[] = [];
  const selected: VnChoice[] = [];
  for (const c of choices) {
    if (c.selected) { selected.push(c,); }
    else { available.push(c,); }
  }

  container.replaceChildren();

  // Available choices (interactive)
  if (available.length > 0) {
    const choiceList = document.createElement("div",);
    choiceList.className = "vn-choices-list";

    for (const choice of available) {
      const card = document.createElement("button",);
      card.className = "vn-choice-card";
      card.type = "button";
      card.dataset.choiceId = choice.id;

      card.innerHTML = `
        <div class="vn-choice-label">${escapeHtml(choice.label,)}</div>
        ${choice.description ? `<div class="vn-choice-description">${escapeHtml(choice.description,)}</div>` : ""}
      `;

      card.addEventListener("click", () => {
        selectChoice(choice.id,);
      },);

      choiceList.append(card,);
    }

    container.append(choiceList,);
  }

  // Selected choices (history, collapsed)
  if (selected.length > 0) {
    const history = document.createElement("details",);
    history.className = "vn-choice-history";

    const summary = document.createElement("summary",);
    summary.textContent = `Past choices (${selected.length})`;
    history.append(summary,);

    const historyList = document.createElement("div",);
    historyList.className = "vn-choice-history-list";

    for (const choice of selected) {
      const item = document.createElement("div",);
      item.className = "vn-choice-selected";
      item.innerHTML = `
        <span class="vn-choice-label">${escapeHtml(choice.label,)}</span>
        <span class="vn-choice-timestamp">${formatTime(choice.selected_at!,)}</span>
      `;
      historyList.append(item,);
    }

    history.append(historyList,);
    container.append(history,);
  }
}

function escapeHtml(text: string,): string {
  const div = document.createElement("div",);
  div.textContent = text;
  return div.getHTML();
}

function formatTime(iso: string,): string {
  const date = new Date(iso,);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", },);
}
