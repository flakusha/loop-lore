// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Choice Cards — DOM rendering
 *
 * Extracted from choice-cards.ts to keep the parent file under the size gate.
 * Internal helpers; consumers should import from "../choice-cards".
 */
import type { VnChoice, } from "./choice-cards";

/**
 * Render all choices into the container, separated into available (clickable)
 * and selected (disabled) sections.
 */
export function renderChoices(
  container: HTMLElement | null,
  choices: VnChoice[],
  onSelect: (choiceId: string,) => void,
): void {
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

  for (const c of available) {
    const card = renderCard(c, false,);
    card.addEventListener("click", () => {
      onSelect(c.id,);
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

function renderCard(choice: VnChoice, isSelected: boolean,): HTMLButtonElement {
  const card = document.createElement("button",);
  card.className = `vn-choice-card${isSelected ? " vn-choice-card--selected" : ""}`;
  card.type = "button";

  const label = document.createElement("span",);
  label.className = "vn-choice-card__label";
  label.textContent = choice.label ?? choice.text;
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
}
