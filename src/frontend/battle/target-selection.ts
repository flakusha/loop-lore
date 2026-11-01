// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle panel — target selection UI.
 */

export interface TargetOption {
  id: string;
  name: string;
  disabled?: boolean;
}

export function renderTargetSelector(
  targets: TargetOption[],
  selectedId: string | null,
  onSelect: (id: string,) => void,
): HTMLElement {
  const list = document.createElement("div",);
  list.className = "battle-target-selector";
  list.setAttribute("role", "radiogroup",);
  list.setAttribute("aria-label", "Select target",);

  for (const target of targets) {
    const btn = document.createElement("button",);
    btn.type = "button";
    btn.className = "battle-target";
    btn.dataset.targetId = target.id;
    btn.textContent = target.name;
    btn.disabled = target.disabled ?? false;
    if (selectedId === target.id) {
      btn.classList.add("is-selected",);
      btn.setAttribute("aria-checked", "true",);
    } else {
      btn.setAttribute("aria-checked", "false",);
    }

    btn.setAttribute("role", "radio",);
    btn.addEventListener("click", () => {
      if (!btn.disabled) { onSelect(target.id,); }
    },);

    list.append(btn,);
  }

  return list;
}
