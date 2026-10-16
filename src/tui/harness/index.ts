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
import { loadRunDetail, loadRuns, loadStats, } from "./api";
import { formatEmptyRuns, formatRunDetail, formatRunLine, formatStats, } from "./display";
import type { HarnessRunSummary, } from "./types";

export { loadRunDetail, loadRuns, loadStats, } from "./api";
export { formatDuration, formatEmptyRuns, formatRunDetail, formatRunLine, formatStats, } from "./display";
export type { HarnessRunDetail, HarnessRunSummary, HarnessStats, } from "./types";

const DETAIL_TOP = 3;
const RUN_LIMIT = 25;

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

  show(): void {
    this._visible = true;
    this.box.show();
    this.screen.render();
  }

  hide(): void {
    this._visible = false;
    this.box.hide();
    this.screen.render();
  }

  toggle(): void {
    if (this._visible) {
      this.hide();
    } else {
      this.show();
      void this.refresh();
    }
  }

  /**
   * Close the panel if it is open. The app calls this from its global Esc/q/Ctrl-C
   * handler so an open harness swallows the key instead of quitting the process
   * — the same shape `ChatPicker` and `ModelsOverlay` already expose.
   * @returns true when the panel was visible and has now been hidden
   */
  dismiss(): boolean {
    if (!this._visible) { return false; }
    this.hide();
    return true;
  }

  isVisible(): boolean {
    return this._visible;
  }

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
    } else {
      const stats = await loadStats(this.sessionToken,);
      if (stats.ok && stats.data) {
        this.detailLabel.setContent(formatStats(stats.data,),);
        this.screen.render();
      }
    }
  }

  getRuns(): HarnessRunSummary[] {
    return this.runs;
  }

  private renderList(): void {
    this.list.clearItems();
    if (this.runs.length === 0) {
      this.list.setContent(formatEmptyRuns(),);
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
