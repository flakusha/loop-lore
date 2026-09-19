// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Escape-to-close + focus restore for the asset preview modal (TASK-001).
 *
 * The modal is opened imperatively (not via `openModal`), so it owns its
 * own keydown listener: Escape closes the overlay and returns focus to the
 * element that opened it. The listener is detached on every close path so
 * repeated opens never stack handlers.
 * @param doc - document carrying the keydown listener registry
 */
export function previewEscapeState() {
  let doc: {
    addEventListener(t: string, fn: (e: { key: string },) => void,): void;
    removeEventListener(t: string, fn: (e: { key: string },) => void,): void;
    querySelector(sel: string,): { classList: { remove(n: string,): void } } | null;
  } | null = null;
  let handler: ((e: { key: string },) => void) | null = null;
  let trigger: { focus(): void } | null = null;
  const detach = (): void => {
    if (handler && doc) {
      doc.removeEventListener("keydown", handler,);
      handler = null;
    }
  };
  return {
    /** Attach the Escape listener, remembering the opening trigger. */
    arm(
      current: { focus(): void } | null,
      host: {
        addEventListener(t: string, fn: (e: { key: string },) => void,): void;
        removeEventListener(t: string, fn: (e: { key: string },) => void,): void;
        querySelector(sel: string,): { classList: { remove(n: string,): void } } | null;
      },
    ): void {
      detach();
      doc = host;
      trigger = current;
      handler = (e: { key: string },): void => {
        if (e.key !== "Escape") { return; }
        doc?.querySelector("#preview-modal",)?.classList.remove("open",);
        detach();
        trigger?.focus();
        trigger = null;
      };
      doc.addEventListener("keydown", handler,);
    },
  };
}
