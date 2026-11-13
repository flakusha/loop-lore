// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Choice Cards — component lifecycle.
 *
 * Mounts/unmounts the branching choice cards in VN mode and hydrates the
 * card list from the API. Card resolution (select, skip, custom submit and
 * their consequences) lives in `choice-cards-select.ts`; the shared state
 * both sides read through accessors lives in `choice-cards-state.ts`.
 */
import { apiFetch, } from "../alpine/htmx";
import { renderChoices, } from "./choice-cards-select";
import {
  getChatId,
  getSceneIndex,
  initChoiceState,
  resetChoiceState,
  setChoices,
  type VnChoice,
} from "./choice-cards-state";
import { setChoicePending, } from "./pending-decision";

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
  initChoiceState(containerEl, currentChatId, currentSceneIndex,);
}

/** Destroy the choice cards component. */
export function destroyChoiceCards(): void {
  // Leaving the flag set here would wedge the composer: the cards are gone, so
  // nothing can resolve the decision the gate is still waiting on.
  setChoicePending(false,);
  resetChoiceState();
}

/**
 * Load choices for the current scene from the API.
 * @returns {Promise<void>}
 */
export async function loadChoices(): Promise<void> {
  const chatId = getChatId();
  if (!chatId) { return; }
  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/vn-choices?sceneIndex=${getSceneIndex()}`,);
    if (!res.ok) { return; }
    const data = await res.json();
    const raw: VnChoice[] = data.choices ?? data.data ?? [];
    const hydrated: VnChoice[] = [];
    for (const c of raw) {
      hydrated.push({
        ...c,
        selected: c.selected === true || c.is_active === 1,
        label: c.label ?? c.text ?? "Untitled choice",
      },);
    }

    setChoices(hydrated,);
    setChoicePending(hydrated.length > 0,);
    renderChoices();
  } catch {
    setChoices([],);
    setChoicePending(false,);
  }
}
