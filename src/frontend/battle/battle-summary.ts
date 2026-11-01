// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Expandable battle summary card (B2 decision).
 *
 * Collapsed: the bare deterministic summary lines (the same minimal text
 * the backend posts as the end-of-battle systemMessage — no extra backend
 * work). Expanded: the full battle log, reusing `renderBattleLog`.
 * A `<button>` toggle drives `hidden` on the log container; collapsed is
 * the default so long logs never ambush the layout.
 */
import type { BattleSummary, } from "../../rpg/service/battles/summary.js";
import { t, } from "../alpine/i18n";
import { renderBattleLog, } from "./battle-log.js";
import type { BattleLogEntryView, } from "./commands.js";

/**
 * Render the end-of-battle summary card.
 * @param summary Deterministic summary (headline + counts)
 * @param log Full battle log entries for the expanded view
 * @returns Collapsed-by-default summary element
 */
export function renderBattleSummary(summary: BattleSummary, log: BattleLogEntryView[],): HTMLElement {
  const card = document.createElement("section",);
  card.className = "battle-summary";
  card.setAttribute("aria-label", t("battle.battleSummary",),);

  const headline = document.createElement("p",);
  headline.className = "battle-summary-headline";
  headline.textContent = summary.lines[0] ?? "Battle ended.";
  card.append(headline,);

  const meta = document.createElement("p",);
  meta.className = "battle-summary-meta";
  meta.textContent = summary.lines.slice(1,).join(" · ",);
  card.append(meta,);

  if (log.length === 0) { return card; }

  const toggle = document.createElement("button",);
  toggle.type = "button";
  toggle.className = "battle-summary-toggle";
  toggle.textContent = t("battle.showLog", { count: log.length, },);
  toggle.setAttribute("aria-expanded", "false",);

  const expanded = renderBattleLog(log,);
  if (expanded) {
    expanded.hidden = true;
    toggle.addEventListener("click", () => {
      const open = expanded.hidden;
      expanded.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open,),);
      toggle.textContent = open ? t("battle.hideLog",) : t("battle.showLog", { count: log.length, },);
    },);

    card.append(toggle, expanded,);
  }

  return card;
}
