// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI Harness View
 *
 * Toggleable panel showing recent harness agent runs.
 * F3 toggles visibility; Up/Down navigate runs; Enter loads detail.
 * Pure HTTP client — zero business logic.
 */

import blessed from "blessed";
import { loadRunDetail, loadRuns, } from "./api";
import { formatEmptyRuns, formatRunDetail, formatRunLine, } from "./display";
import type { HarnessRunSummary, } from "./types";

export { loadRunDetail, loadRuns, } from "./api";
export { formatDuration, formatEmptyRuns, formatRunDetail, formatRunLine, truncateTask, } from "./display";
export type { HarnessRunDetail, HarnessRunSummary, HarnessStats, } from "./types";

const DETAIL_TOP = 3;
const RUN_LIMIT = 25;

/**
 * @param screen
 * @param sessionToken - admin session token for the harness API
 */
export function createHarnessView(
  screen: blessed.Widgets.Screen,
  sessionToken: string | undefined,
): HarnessView {
  return new HarnessView(screen, sessionToken,);
}

export class HarnessView {
  private screen: blessed.Widgets.Screen;
  private sessionToken: string | undefined;
  private box: blessed.Widgets.BoxElement;
  private list: blessed.Widgets.ListElement;
  private detailLabel: blessed.Widgets.BlessedElement;
  private runs: HarnessRunSummary[] = [];
  private currentIndex = 0;
  private _visible = false;

  /**
   * @param screen
   * @param sessionToken
   */
  constructor(screen: blessed.Widgets.Screen, sessionToken: string | undefined,) {
    this.screen = screen;
    this.sessionToken = sessionToken;

    this.box = blessed.box({
      parent: screen,
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      label: " {bold}Harness Runs{/bold} ",
      tags: true,
      border: { type: "line", },
      style: { bg: "black", fg: "white", border: { fg: "cyan", }, },
      scrollable: true,
      hidden: true,
    },);

    this.list = blessed.list({
      parent: this.box,
      top: 0,
      left: 1,
      right: 1,
      height: "50%",
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      border: { type: "line", },
      style: {
        selected: { bg: "cyan", fg: "black", },
        item: { fg: "white", },
      },
    },);

    this.detailLabel = blessed.text({
      parent: this.box,
      top: DETAIL_TOP,
      left: 1,
      right: 1,
      tags: true,
      content: "",
      style: { fg: "white", },
    },);

    // blessed emits the selected INDEX as the second arg (lib/widgets/list.js:586).
    // The row content is the FORMATTED line, which carries no runId, so the old
    // `el.content` lookup always missed and currentIndex never moved.
    this.list.on("select", (_el: blessed.Widgets.BlessedElement, index: number,) => {
      if (index >= 0 && index < this.runs.length) { this.currentIndex = index; }
      void this.showDetail(this.currentIndex,);
    },);

    screen.key(["up", "down",], (_ch: string, key: { name: string },) => {
      if (!this._visible || this.runs.length === 0) { return; }
      if (key.name === "up") {
        this.currentIndex = (this.currentIndex - 1 + this.runs.length) % this.runs.length;
      } else {
        this.currentIndex = (this.currentIndex + 1) % this.runs.length;
      }

      this.list.select(this.currentIndex,);
      void this.showDetail(this.currentIndex,);
    },);

    screen.key(["enter",], () => {
      if (!this._visible || this.runs.length === 0) { return; }
      void this.showDetail(this.currentIndex,);
    },);
  }

  /** Show the harness panel. */
  show(): void {
    this._visible = true;
    this.box.show();
    this.screen.render();
  }

  /** Hide the harness panel. */
  hide(): void {
    this._visible = false;
    this.box.hide();
    this.screen.render();
  }

  /** Toggle visibility. */
  toggle(): void {
    if (this._visible) {
      this.hide();
    } else {
      this.show();
      void this.refresh();
    }
  }

  /** @returns whether the panel is currently visible. */
  isVisible(): boolean {
    return this._visible;
  }

  /** Reload runs from the API and render the list. */
  async refresh(): Promise<void> {
    const result = await loadRuns(RUN_LIMIT, this.sessionToken,);
    if (!result.ok) {
      this.runs = [];
      this.currentIndex = 0;
      this.list.clearItems();
      this.list.setContent(result.error,);
      this.detailLabel.setContent("",);
      this.screen.render();
      return;
    }

    this.runs = result.data.items;
    this.currentIndex = 0;
    this.renderList();
    if (this.runs.length > 0) {
      void this.showDetail(0,);
    }
  }

  /** @returns current runs array for testing. */
  getRuns(): HarnessRunSummary[] {
    return this.runs;
  }

  private renderList(): void {
    this.list.clearItems();
    if (this.runs.length === 0) {
      this.list.setContent(formatEmptyRuns(),);
      this.detailLabel.setContent("",);
      this.screen.render();
      return;
    }

    for (const run of this.runs) {
      this.list.add(formatRunLine(run,),);
    }

    this.list.select(0,);
  }

  private async showDetail(index: number,): Promise<void> {
    if (this.runs.length === 0) {
      this.detailLabel.setContent("",);
      this.screen.render();
      return;
    }

    const run = this.runs[index];
    if (!run) { return; }

    const result = await loadRunDetail(run.runId, this.sessionToken,);
    if (!result.ok) {
      this.detailLabel.setContent(
        `{red-fg}Failed to load detail: ${result.error}{/red-fg}`,
      );

      this.screen.render();
      return;
    }

    this.detailLabel.setContent(formatRunDetail(result.data,),);
    this.screen.render();
  }
}
