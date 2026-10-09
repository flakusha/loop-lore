// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Choice card DOM rendering. */
import { t, } from "../alpine/i18n";
import type { VnChoice, } from "./choice-cards";

// ── Internal ────────────────────────────────────────────────────────────────

/**
 * @param container
 * @param choices
 * @param onSelect
 * @returns {void}
 */
export function renderChoiceCards(
  container: HTMLElement,
  choices: VnChoice[],
  onSelect: (id: string,) => void,
  onSkip?: (id: string,) => void,
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

  const renderCard = (choice: VnChoice, isSelected: boolean,) => {
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
  };

  for (const c of available) {
    const card = renderCard(c, false,);
    card.addEventListener("click", () => {
      void onSelect(c.id,);
    },);

    choiceList.append(card,);
  }

  for (const c of selected) {
    const card = renderCard(c, true,);
    card.disabled = true;
    choiceList.append(card,);
  }

  container.append(choiceList,);

  // Skip control. Only rendered while something is still available — with
  // every card resolved there is no decision left to skip.
  if (available.length > 0 && onSkip) {
    const skip = document.createElement("button",);
    skip.className = "vn-choice-skip";
    skip.type = "button";
    skip.textContent = t("toasts.vnSkipChoice",);
    skip.addEventListener("click", () => {
      for (const c of available) {
        void onSkip(c.id,);
      }
    },);

    container.append(skip,);
  }
}
