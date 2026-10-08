// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export function autoResize(el: HTMLTextAreaElement, maxPx = 200,): void {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxPx,)}px`;
}

// Register on globalThis so Alpine templates without a local autoResize
// method (e.g. plain modals) can call it as a bare identifier.
(globalThis as Record<string, unknown>).autoResize = autoResize;
