// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW body-state widget — health, conditions and arousal for the chat
 * character (EPIC-NSFW-UI Phase 2).
 *
 * Pure DOM builders in the battle-panel style: the Alpine mixin
 * (`src/frontend/alpine/nsfw-body`) loads the backend rows, maps them into a
 * {@link BodyStateView} and mounts {@link renderBodyState} into the
 * `x-ref="bodyStatePanel"` slot of `src/components/chat/body-state.html` —
 * the same surface as the read-only status panel. Health-style meters reuse
 * the shared battle health-bar widget; every string goes through the i18n
 * catalog (`nsfw.bodyState.*`). Unit-tested in body-state.test.ts on the
 * battle fake DOM.
 */

import { t, } from "../alpine/i18n";
import { renderHealthBar, } from "../battle/health-bar.js";

/** HP pair as rendered by the health row. */
export interface BodyHealthView {
  /** Current hit points. */
  hp: number;
  /** Maximum hit points. */
  maxHp: number;
}

/** Arousal level (0-100) as rendered by the arousal row. */
export interface BodyArousalView {
  /** Current arousal level, 0-100. */
  level: number;
}

/** One active condition (disease/poison/buff) as rendered in the list. */
export interface BodyConditionView {
  /** Stable id derived from the condition name. */
  id: string;
  /** Display name ("Poisoned", "Blessed", ...). */
  name: string;
  /** Source label, when the backend recorded one. */
  source: string | null;
  /** Remaining rounds, when the backend recorded one (-1 = indefinite). */
  durationTurns: number | null;
}

/** Everything the widget renders for one character. */
export interface BodyStateView {
  /** HP pair; null when the backend has no stats row or denied access. */
  health: BodyHealthView | null;
  /** Arousal level; null when absent or NSFW access was denied. */
  arousal: BodyArousalView | null;
  /** Active conditions; empty when none are recorded. */
  conditions: BodyConditionView[];
}

/**
 * Map an arousal level onto its i18n tier label.
 *
 * Thresholds mirror the server-side prompt tiers
 * (`src/assistant/prompt/sections/nsfw-context.ts`): ≥80 desperate,
 * ≥60 highly aroused, ≥40 aroused, ≥20 mildly aroused, else calm.
 * @param level - arousal level, 0-100
 * @returns {string} the localized tier label
 */
export function arousalTierLabel(level: number,): string {
  const key = level >= 80
    ? "nsfw.bodyState.arousalDesperate"
    : level >= 60
    ? "nsfw.bodyState.arousalHigh"
    : level >= 40
    ? "nsfw.bodyState.arousalActive"
    : level >= 20
    ? "nsfw.bodyState.arousalMild"
    : "nsfw.bodyState.arousalCalm";

  return t(key,);
}

/**
 * Build one labeled meter row (label + shared health bar + trailing value).
 * @param label - localized meter name (also the bar's accessible name)
 * @param value - current level
 * @param max - meter maximum
 * @param valueText - localized trailing value (number pair or tier label)
 * @param testId - data-testid for the row
 * @returns {HTMLElement} the `.nsfw-body-state-row` element
 */
function renderMeterRow(
  label: string,
  value: number,
  max: number,
  valueText: string,
  testId: string,
): HTMLElement {
  const row = document.createElement("div",);
  row.className = "nsfw-body-state-row";
  row.dataset.testid = testId;

  const labelEl = document.createElement("span",);
  labelEl.className = "nsfw-body-state-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span",);
  valueEl.className = "nsfw-body-state-value";
  valueEl.textContent = valueText;

  row.append(labelEl, renderHealthBar(value, max, { label, },), valueEl,);
  return row;
}

/**
 * Build the conditions block: a titled list when conditions exist, otherwise
 * a single "no active conditions" line.
 * @param conditions - active conditions
 * @returns {HTMLElement} the `.nsfw-body-state-conditions` element
 */
function renderConditions(conditions: BodyConditionView[],): HTMLElement {
  const block = document.createElement("div",);
  block.className = "nsfw-body-state-conditions";
  block.dataset.testid = "body-state-conditions";

  const title = document.createElement("div",);
  title.className = "nsfw-body-state-conditions-title";
  title.textContent = t("nsfw.bodyState.conditions",);
  block.append(title,);

  if (conditions.length === 0) {
    const empty = document.createElement("div",);
    empty.className = "nsfw-body-state-empty";
    empty.textContent = t("nsfw.bodyState.noConditions",);
    block.append(empty,);
    return block;
  }

  const list = document.createElement("ul",);
  list.className = "nsfw-body-state-condition-list";
  for (const condition of conditions) {
    const item = document.createElement("li",);
    item.className = "nsfw-body-state-condition";
    item.setAttribute("role", "listitem",);

    const name = document.createElement("span",);
    name.className = "nsfw-body-state-condition-name";
    name.textContent = condition.name;
    item.append(name,);

    const meta: string[] = [];
    if (condition.source) { meta.push(t("nsfw.bodyState.source", { source: condition.source, },),); }
    if (condition.durationTurns !== null && condition.durationTurns >= 0) {
      meta.push(t("nsfw.bodyState.turnsLeft", { count: condition.durationTurns, },),);
    }

    if (meta.length > 0) {
      const metaEl = document.createElement("span",);
      metaEl.className = "nsfw-body-state-condition-meta";
      metaEl.textContent = meta.join(" · ",);
      item.append(metaEl,);
    }

    list.append(item,);
  }

  block.append(list,);
  return block;
}

/**
 * Render the body-state section for a character.
 *
 * Returns `null` when the view carries no data at all (no stats, no arousal,
 * no conditions) so the mixin can leave the mount slot empty instead of
 * rendering an empty shell — mirroring the read-only status panel, which
 * renders nothing rather than an error state.
 * @param view - mapped body-state view for the character
 * @returns {HTMLElement | null} the `.nsfw-body-state` section, or null
 */
export function renderBodyState(view: BodyStateView,): HTMLElement | null {
  if (!view.health && !view.arousal && view.conditions.length === 0) { return null; }

  const section = document.createElement("section",);
  section.className = "nsfw-body-state";
  section.setAttribute("role", "group",);
  section.setAttribute("aria-label", t("nsfw.bodyState.title",),);
  section.dataset.testid = "nsfw-body-state";

  const title = document.createElement("h4",);
  title.className = "nsfw-title";
  title.textContent = t("nsfw.bodyState.title",);
  section.append(title,);

  if (view.health) {
    const hpText = `${view.health.hp}/${view.health.maxHp}`;
    section.append(
      renderMeterRow(
        t("nsfw.bodyState.health",),
        view.health.hp,
        view.health.maxHp,
        hpText,
        "body-state-health",
      ),
    );
  }

  if (view.arousal) {
    section.append(
      renderMeterRow(
        t("nsfw.bodyState.arousal",),
        view.arousal.level,
        100,
        arousalTierLabel(view.arousal.level,),
        "body-state-arousal",
      ),
    );
  }

  section.append(renderConditions(view.conditions,),);
  return section;
}
