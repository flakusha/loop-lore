// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW intimacy interface — per-phase DOM builders (EPIC-NSFW-UI Phase 1).
 * Split out of `intimacy-interface.ts` (size gate): that module keeps the
 * dispatcher, this one owns the primitives and every phase renderer. Pure
 * render: no fetch, no Alpine imports — the Alpine mixin
 * (`src/frontend/alpine/nsfw-intimacy`) owns flow state. Zero innerHTML:
 * every text node goes through `textContent` (frontend innerHTML-xss gate),
 * every string through the i18n catalog (`nsfw.intimacy.*`).
 */

import { t, } from "../alpine/i18n";
import { renderHealthBar, } from "../battle/health-bar.js";
import { actionLocked, } from "./intimacy-scene";
import type { IntimacyFlowState, } from "./intimacy-types";
import {
  actionDescription,
  actionLabel,
  INTIMACY_ACTION_CATALOG,
  INTIMACY_POSITION_CATALOG,
  positionDescription,
  positionLabel,
} from "./intimacy-types";

/** Click handlers the renderer wires up; all optional (phase-dependent). */
export interface IntimacyPanelHandlers {
  /** The idle-phase open button was clicked. */
  onOpen?: () => void;
  /** A partner button was clicked. */
  onPartner?: (actorId: string,) => void;
  /** A position button was clicked (positionSelect phase). */
  onPosition?: (positionId: string,) => void;
  /** An action button was clicked (only enabled actions fire). */
  onAction?: (actionId: string,) => void;
  /** The consent dialog's confirm button was clicked. */
  onConfirm?: () => void;
  /** The consent dialog's cancel button was clicked. */
  onCancel?: () => void;
  /** The effects screen's continue button was clicked. */
  onContinue?: () => void;
  /** The error screen's retry button was clicked. */
  onRetry?: () => void;
  /** A back button was clicked (consent → actions, actions → partners). */
  onBack?: () => void;
  /** The close button was clicked (return to idle). */
  onClose?: () => void;
}

/** Create a button with a stable test id and click wiring.
 * @param label - localized button text
 * @param testId - data-testid for assertions
 * @param onClick - click handler
 * @returns {HTMLButtonElement} the button element
 */
function button(label: string, testId: string, onClick?: () => void,): HTMLButtonElement {
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
function sectionShell(testId: string,): HTMLElement {
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
function phaseTitle(key: string,): HTMLElement {
  const title = document.createElement("h4",);
  title.className = "nsfw-title";
  title.textContent = t(key,);
  return title;
}

/** Build the back + close row.
 * @param handlers - click handlers
 * @param withBack - whether the phase offers a back button
 * @returns {HTMLElement} the nav row
 */
function navRow(handlers: IntimacyPanelHandlers, withBack: boolean,): HTMLElement {
  const nav = document.createElement("div",);
  nav.className = "nsfw-intimacy-nav";

  if (withBack) { nav.append(button(t("nsfw.intimacy.back",), "nsfw-intimacy-back", handlers.onBack,),); }
  nav.append(button(t("nsfw.intimacy.close",), "nsfw-intimacy-close", handlers.onClose,),);
  return nav;
}

/** Render the idle phase: the open trigger only.
 * @param handlers - click handlers
 * @returns {HTMLElement} the section
 */
export function renderIdle(handlers: IntimacyPanelHandlers,): HTMLElement {
  const section = sectionShell("nsfw-intimacy-idle",);
  section.append(button(t("nsfw.intimacy.open",), "nsfw-intimacy-open", handlers.onOpen,),);
  return section;
}

/** Render the partner-selection phase.
 * @param state - flow state (partners come from the mixin's stored options)
 * @param partners - selectable partners
 * @param handlers - click handlers
 * @returns {HTMLElement} the section
 */
export function renderPartnerSelect(
  state: IntimacyFlowState,
  partners: { actorId: string; displayName: string }[],
  handlers: IntimacyPanelHandlers,
): HTMLElement {
  const section = sectionShell("nsfw-intimacy-partners",);
  section.append(phaseTitle("nsfw.intimacy.partnerTitle",),);

  if (partners.length === 0) {
    const empty = document.createElement("div",);
    empty.className = "nsfw-intimacy-empty";
    empty.dataset.testid = "nsfw-intimacy-empty";
    empty.textContent = t("nsfw.intimacy.partnerEmpty",);
    section.append(empty,);
    return section;
  }

  const list = document.createElement("div",);
  list.className = "nsfw-intimacy-partner-list";

  for (const partner of partners) {
    const chosen = state.partner?.actorId === partner.actorId;
    const btn = button(
      partner.displayName,
      `nsfw-intimacy-partner-${partner.actorId}`,
      () => handlers.onPartner?.(partner.actorId,),
    );

    btn.setAttribute("aria-pressed", String(chosen,),);
    list.append(btn,);
  }

  section.append(list, navRow(handlers, false,),);
  return section;
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
export function renderPositionSelect(state: IntimacyFlowState, handlers: IntimacyPanelHandlers,): HTMLElement {
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

/** Render the action-selection grid (locked actions disabled with the requirement).
 * @param pairScore - current pair score
 * @param handlers - click handlers
 * @returns {HTMLElement} the section
 */
export function renderActionSelect(pairScore: number, handlers: IntimacyPanelHandlers,): HTMLElement {
  const section = sectionShell("nsfw-intimacy-actions",);
  section.append(phaseTitle("nsfw.intimacy.actionTitle",),);
  const score = document.createElement("div",);
  score.className = "nsfw-intimacy-score";
  score.dataset.testid = "nsfw-intimacy-score";
  score.textContent = t("nsfw.intimacy.scoreLabel", { score: pairScore, },);
  section.append(score,);

  const grid = document.createElement("div",);
  grid.className = "nsfw-intimacy-action-grid";

  for (const action of INTIMACY_ACTION_CATALOG) {
    const locked = actionLocked(action, pairScore,);
    const btn = button(actionLabel(action,), `nsfw-intimacy-action-${action.id}`, () => {
      if (!locked) { handlers.onAction?.(action.id,); }
    },);

    btn.disabled = locked;
    btn.setAttribute("aria-disabled", String(locked,),);
    const desc = document.createElement("div",);
    desc.className = "nsfw-intimacy-action-desc";
    desc.textContent = locked
      ? t("nsfw.intimacy.lockedFmt", { min: action.minIntimacy, },)
      : actionDescription(action,);

    const cell = document.createElement("div",);
    cell.className = "nsfw-intimacy-action";
    cell.dataset.testid = `nsfw-intimacy-action-cell-${action.id}`;
    cell.append(btn, desc,);
    grid.append(cell,);
  }

  section.append(grid, navRow(handlers, true,),);
  return section;
}

/** Render the consent-confirmation dialog phase.
 * @param state - flow state carrying the pending action
 * @param handlers - click handlers
 * @returns {HTMLElement} the section
 */
export function renderConfirmConsent(state: IntimacyFlowState, handlers: IntimacyPanelHandlers,): HTMLElement {
  const section = sectionShell("nsfw-intimacy-consent",);
  section.append(phaseTitle("nsfw.intimacy.consentTitle",),);
  const body = document.createElement("p",);
  body.className = "nsfw-intimacy-consent-body";
  body.dataset.testid = "nsfw-intimacy-consent-body";
  const actionName = state.action ? actionLabel(state.action,) : "";
  body.textContent = t("nsfw.intimacy.consentBody", { action: actionName, },);
  section.append(body,);

  const row = document.createElement("div",);
  row.className = "nsfw-intimacy-consent-row";
  row.append(
    button(t("nsfw.intimacy.confirm",), "nsfw-intimacy-consent-confirm", handlers.onConfirm,),
    button(t("nsfw.intimacy.cancel",), "nsfw-intimacy-consent-cancel", handlers.onCancel,),
  );

  section.append(row, navRow(handlers, true,),);
  return section;
}

/** Render the applying (busy) phase.
 * @returns {HTMLElement} the section
 */
export function renderApplying(): HTMLElement {
  const section = sectionShell("nsfw-intimacy-applying",);
  section.append(phaseTitle("nsfw.intimacy.applying",),);
  return section;
}

/** Render the effects phase: refreshed score meter + threshold unlocks.
 * @param state - flow state carrying the apply outcome
 * @param handlers - click handlers
 * @returns {HTMLElement} the section
 */
export function renderEffects(state: IntimacyFlowState, handlers: IntimacyPanelHandlers,): HTMLElement {
  const section = sectionShell("nsfw-intimacy-effects",);
  section.append(phaseTitle("nsfw.intimacy.effectsTitle",),);
  const outcome = state.outcome;

  if (!outcome) { return section; }

  if (state.position) {
    const staging = document.createElement("div",);
    staging.className = "nsfw-intimacy-staging";
    staging.dataset.testid = "nsfw-intimacy-staging";
    staging.textContent = t("nsfw.intimacy.stagingFmt", { position: positionLabel(state.position,), },);
    section.append(staging,);
  }

  const delta = document.createElement("div",);
  delta.className = "nsfw-intimacy-delta";
  delta.dataset.testid = "nsfw-intimacy-delta";
  delta.textContent = t("nsfw.intimacy.deltaFmt", { delta: outcome.actualDelta, score: outcome.newScore, },);
  section.append(
    delta,
    renderHealthBar(outcome.newScore, 100, { label: t("nsfw.intimacy.scoreLabel", { score: outcome.newScore, },), },),
  );

  if (!outcome.applied && outcome.reason) {
    const reason = document.createElement("div",);
    reason.className = "nsfw-intimacy-notapplied";
    reason.textContent = outcome.reason;
    section.append(reason,);
  }

  if (outcome.thresholdsReached.length > 0) {
    const block = document.createElement("div",);
    block.className = "nsfw-intimacy-thresholds";
    block.dataset.testid = "nsfw-intimacy-thresholds";

    for (const threshold of outcome.thresholdsReached) {
      const item = document.createElement("div",);
      item.className = "nsfw-intimacy-threshold";
      item.textContent = `${threshold.label} — ${threshold.unlock}`;
      block.append(item,);
    }

    section.append(block,);
  }

  if (outcome.suggestedRelationshipUpgrade) {
    const upgrade = document.createElement("div",);
    upgrade.className = "nsfw-intimacy-upgrade";
    upgrade.textContent = outcome.suggestedRelationshipUpgrade;
    section.append(upgrade,);
  }

  section.append(navRow(handlers, false,),);
  section.append(button(t("nsfw.intimacy.continue",), "nsfw-intimacy-continue", handlers.onContinue,),);
  return section;
}

/** Localized message for an error kind.
 * @param kind - classified failure kind
 * @returns {string} the localized error line
 */
function errorText(kind: "consent" | "target" | "validation" | "auth" | "network",): string {
  const keys = {
    consent: "nsfw.intimacy.errorConsent",
    target: "nsfw.intimacy.errorTarget",
    validation: "nsfw.intimacy.errorValidation",
    auth: "nsfw.intimacy.errorAuth",
    network: "nsfw.intimacy.errorNetwork",
  } as const;

  return t(keys[kind],);
}

/** Render the error phase with retry/back affordances.
 * @param state - flow state carrying the classified error
 * @param handlers - click handlers
 * @returns {HTMLElement} the section
 */
export function renderError(state: IntimacyFlowState, handlers: IntimacyPanelHandlers,): HTMLElement {
  const section = sectionShell("nsfw-intimacy-error",);
  section.append(phaseTitle("nsfw.intimacy.errorTitle",),);
  const message = document.createElement("div",);
  message.className = "nsfw-intimacy-error-msg";
  message.dataset.testid = "nsfw-intimacy-error-msg";
  message.textContent = state.error ? errorText(state.error.kind,) : "";
  section.append(message,);

  const row = document.createElement("div",);
  row.className = "nsfw-intimacy-error-row";

  if (state.error?.kind === "consent" || state.error?.kind === "network" || state.error?.kind === "validation") {
    row.append(button(t("nsfw.intimacy.retry",), "nsfw-intimacy-retry", handlers.onRetry,),);
  }

  section.append(row, navRow(handlers, true,),);
  return section;
}
