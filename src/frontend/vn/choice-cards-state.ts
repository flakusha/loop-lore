// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN choice-card component state.
 *
 * Owns the card list and the component-scoped refs (container, chat, scene)
 * shared by the choice-cards modules: `choice-cards.ts` hydrates and tears
 * the state down, `choice-cards-select.ts` resolves cards against it. Sibling
 * modules reach the state only through the accessors below, so there is a
 * single writer per field and no module-level state duplication.
 */
import { setChoicePending, } from "./pending-decision";

/** One branching choice rendered as a card in VN mode. */
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

/** Initialize the choice-card state refs. */
export function initChoiceState(
  containerEl: HTMLElement,
  currentChatId: string,
  currentSceneIndex: number,
): void {
  container = containerEl;
  chatId = currentChatId;
  sceneIndex = currentSceneIndex;
}

/** Current card list. */
export function getChoices(): VnChoice[] {
  return choices;
}

/** Replace the card list (hydration or post-selection rewrite). */
export function setChoices(next: VnChoice[],): void {
  choices = next;
}

/** The chat the cards belong to, or null before init. */
export function getChatId(): string | null {
  return chatId;
}

/** The render container, or null after destroy. */
export function getContainer(): HTMLElement | null {
  return container;
}

/** Scene index the current card list was loaded for. */
export function getSceneIndex(): number {
  return sceneIndex;
}

/** Clear the component refs and the card list (component teardown). */
export function resetChoiceState(): void {
  container = null;
  chatId = null;
  sceneIndex = 0;
  choices = [];
}

/**
 * Close the decision gate only while unresolved cards remain — only the
 * picked choice stopped being 'available' server-side, so siblings must
 * keep the gate closed.
 */
export function syncPendingGate(): void {
  setChoicePending(choices.some((c,) => !c.selected),);
}
