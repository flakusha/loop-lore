// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW intimacy interface — position-selection DOM builders (EPIC-NSFW-UI Phase 1).
 * Split out of `intimacy-phases.ts` (size gate). Owns the positionSelect phase
 * renderer plus the shared button/section/title/nav primitives both render
 * modules use. Pure render: no fetch, no Alpine imports — the Alpine mixin
 * (`src/frontend/alpine/nsfw-intimacy`) owns flow state. Zero innerHTML:
 * every text node goes through `textContent` (frontend innerHTML-xss gate),
 * every string through the i18n catalog (`nsfw.intimacy.*`).
 */

import { t, } from "../alpine/i18n";
import type { IntimacyFlowState, } from "./intimacy-types";
import { INTIMACY_POSITION_CATALOG, positionDescription, positionLabel, } from "./intimacy-types";

/** Click handlers the renderer wires up; all optional (phase-dependent). */
export interface IntimacyPositionHandlers {
  /** A position button was clicked (positionSelect phase). */
  onPosition?: (positionId: string,) => void;
  /** The close button was clicked (return to idle). */
  onClose?: () => void;
  /** A back button was clicked (actions -> positions). */
  onBack?: () => void;
}

/** Create a button with a stable test id and click wiring.
 * @param label - localized button text
 * @param testId - data-testid for assertions
 * @param onClick - click handler
 * @returns {HTMLButtonElement} the button element
 */
export function button(label: string, testId: string, onClick?: () => void,): HTMLButtonElement {
  const el = document.createElement("button",);
  el.type = "button";
  el.className = "btn btn-secondary btn-xs nsfw-intimacy-btn";
  el.dataset.testid = testId;
  el.textContent = label;
  if (onClick) { el.addEventListener("click", onClick,); }
  return el;
}

/** Build the shared section shell (role=group + localized aria-label).
 * @param testId - data-testid for the section
 * @returns {HTMLElement} the section element
 */
export function sectionShell(testId: string,): HTMLElement {
  const section = document.createElement("section",);
  section.className = "nsfw-intimacy";
  section.setAttribute("role", "group",);
  section.setAttribute("aria-label", t("nsfw.intimacy.title",),);
  section.dataset.testid = testId;
  return section;
}

/** Build the phase title line.
 * @param key - i18n key of the title
 * @returns {HTMLElement} the title element
 */
export function phaseTitle(key: string,): HTMLElement {
  const title = document.createElement("h4",);
  title.className = "nsfw-title";
  title.textContent = t(key,);
  return title;
}

/** Full nav handlers accepted by {@link navRow} (superset of position needs). */
export interface IntimacyNavHandlers {
  /** A back button was clicked. */
  onBack?: () => void;
  /** The close button was clicked. */
  onClose?: () => void;
}

/** Build the back + close row.
 * @param handlers - click handlers
 * @param withBack - whether the phase offers a back button
 * @returns {HTMLElement} the nav row
 */
export function navRow(handlers: IntimacyNavHandlers, withBack: boolean,): HTMLElement {
  const nav = document.createElement("div",);
  nav.className = "nsfw-intimacy-nav";
  if (withBack) { nav.append(button(t("nsfw.intimacy.back",), "nsfw-intimacy-back", handlers.onBack,),); }
  nav.append(button(t("nsfw.intimacy.close",), "nsfw-intimacy-close", handlers.onClose,),);
  return nav;
}

/** Render the position-selection phase (character positioning display).
 *
 * Client-side staging between partner and action: three descriptive labels
 * with no score gates. The mixin carries the choice into the apply wire
 * `context`; the effects phase echoes the staging alongside the outcome.
 * @param state - flow state (position comes from the mixin's stored choice)
 * @param handlers - click handlers
 * @returns {HTMLElement} the section
 */
export function renderPositionSelect(state: IntimacyFlowState, handlers: IntimacyPositionHandlers,): HTMLElement {
  const section = sectionShell("nsfw-intimacy-positions",);
  section.append(phaseTitle("nsfw.intimacy.positionTitle",),);
  const list = document.createElement("div",);
  list.className = "nsfw-intimacy-position-list";
  for (const position of INTIMACY_POSITION_CATALOG) {
    const chosen = state.position?.id === position.id;
    const btn = button(
      positionLabel(position,),
      `nsfw-intimacy-position-${position.id}`,
      () => handlers.onPosition?.(position.id,),
    );

    btn.setAttribute("aria-pressed", String(chosen,),);
    const desc = document.createElement("div",);
    desc.className = "nsfw-intimacy-position-desc";
    desc.textContent = positionDescription(position,);
    const cell = document.createElement("div",);
    cell.className = "nsfw-intimacy-position";
    cell.dataset.testid = `nsfw-intimacy-position-cell-${position.id}`;
    cell.append(btn, desc,);
    list.append(cell,);
  }

  section.append(list, navRow(handlers, true,),);
  return section;
}
