// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export function autoResize(el: HTMLTextAreaElement, maxPx = 200,): void {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxPx,)}px`;
}
