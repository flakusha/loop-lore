// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Keyboard-navigation consumers for the `goto-*` actions (epic
 * accessibility-input, Phase 3).
 *
 * Navigation reuses the app's own sidebar controls: every nav item already
 * carries the hx-get / hx-target / hx-swap / hx-push-url pair, so clicking it
 * navigates exactly like a mouse click (pushed URL included) — no second
 * navigation mechanism. `goto-home` has no sidebar item; the app root route
 * is the home route and the server resolves it (chat page when signed in,
 * login page when not).
 */
import { $, } from "../dom";
import { log as rootLog, } from "./logger";
import { registerKeynavHandler, } from "./shortcuts";

const log = rootLog.child({ module: "keynav-goto", },);

/** Sidebar control (data-testid) that backs each goto-* action. */
const GOTO_NAV_CONTROLS: Record<string, string> = {
  "goto-chatlist": "nav-chat",
  "goto-personas": "nav-personas",
  "goto-characters": "nav-characters",
  "goto-settings": "nav-settings",
  "goto-gallery": "nav-gallery",
};

/** App root — the server resolves it to the home page. */
const HOME_PATH = "/";

/** Unsubscribe for the live registration (guards double registration). */
let activeUnsub: (() => void) | null = null;

/**
 * Register the `goto-*` consumers. The root Alpine component owns them so
 * they keep working across htmx swaps of #app-root (the sidebar outlives
 * them).
 * @returns {() => void} Unsubscribe removing every handler
 */
export function registerGotoKeynavHandlers(): () => void {
  // A body swap builds a new root component before Alpine tears the old one
  // down, so the previous registration is dropped here — two live sets would
  // navigate twice per keypress.
  activeUnsub?.();

  const unsubscribes: (() => void)[] = [];

  for (const [action, testId,] of Object.entries(GOTO_NAV_CONTROLS,)) {
    unsubscribes.push(registerKeynavHandler(action, () => {
      navigateToControl(testId,);
    },),);
  }

  unsubscribes.push(registerKeynavHandler("goto-home", () => {
    globalThis.location.assign(HOME_PATH,);
  },),);

  activeUnsub = () => {
    for (const unsubscribe of unsubscribes) { unsubscribe(); }
  };

  return activeUnsub;
}

/**
 * Click the sidebar control so the app's own htmx navigation runs.
 * @param testId - data-testid of the nav control
 * @returns {void}
 */
function navigateToControl(testId: string,): void {
  const control = $<HTMLElement>(`[data-testid="${testId}"]`,);
  if (!control) {
    log.warn("goto target not in the DOM", { testId, },);
    return;
  }

  control.click();
}
