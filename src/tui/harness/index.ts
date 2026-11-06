// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 260
/**
 * TUI Harness View (pi-tui)
 *
 * Toggleable full-screen overlay showing recent harness agent runs: run list
 * on top, detail below. F3 toggles it (the shell refreshes on every open);
 * Up/Down navigate runs, Enter reloads the detail. Pure HTTP client — zero
 * business logic.
 *
 * A "Pending requests" block sits above the runs when the harness parked
 * permission asks: `a` approves the highlighted ask, `d` denies it, Tab moves
 * the Up/Down cursor between the two lists.
 */

import { tagsToAnsi, } from "../ansi";
import { renderFramed, } from "../frame";
import { escapeMarkup, } from "../markup";
import { MenuList, } from "../menu";
import { type Component, type Focusable, matchesKey, truncateToWidth, } from "../pi";
import { loadRunDetail, loadRuns, loadStats, type PendingPermission, type PermissionDecision, } from "./api";
import { formatEmptyRuns, formatRunDetail, formatRunLine, formatStats, } from "./display";
import { APPROVE_KEY, DENY_KEY, PendingPermissions, } from "./pending";
import type { HarnessRunSummary, } from "./types";

/** Build a {@link HarnessView} (kept for the shell's import shape). */
export function createHarnessView(options: HarnessViewOptions = {},): HarnessView {
  return new HarnessView(options,);
}

export { decidePermission, loadPendingPermissions, loadRunDetail, loadRuns, loadStats, } from "./api";
export { formatPendingPermission, } from "./display";
export { formatDuration, formatEmptyRuns, formatRunDetail, formatRunLine, formatStats, } from "./display";
export { APPROVE_KEY, DENY_KEY, } from "./pending";
export type { HarnessRunDetail, HarnessRunSummary, HarnessStats, } from "./types";

const RUN_LIMIT = 25;

/** Construction options for {@link HarnessView}. */
export interface HarnessViewOptions {
  /** Bearer token for the harness API; omit to run anonymous. */
  sessionToken?: string;
  /** Repaint hook; the shell routes this to the pi-tui renderer. */
  onRequestRender?: () => void;
  /** Terminal row count source (the shell passes `tui.terminal.rows`). */
  getViewportRows?: () => number;
}

/** */
export class HarnessView implements Component, Focusable {
  focused = false;
  private sessionToken: string | undefined;
  private rows: string[] = [];
  /** Detail rows (already ANSI-converted, multi-line block). */
  private detailLines: string[] = [];
  /** Rendered in place of the list when loading failed. */
  private failure: string | null = null;
  private runs: HarnessRunSummary[] = [];
  /** The parked permission asks, with the operator's approve/deny keys. */
  private readonly pending: PendingPermissions;
  /** True while Up/Down drive the pending list instead of the runs. */
  private pendingFocus = false;
  private visibleFlag = false;
  private readonly menu: MenuList;
  private readonly requestRender: () => void;
  private readonly getViewportRows: () => number;

  /**
   * @param options - bearer token and repaint hooks
   */
  constructor(options: HarnessViewOptions = {},) {
    this.sessionToken = options.sessionToken === "" ? undefined : options.sessionToken;
    this.requestRender = options.onRequestRender ?? ((): void => {
      /* no host wired: tests read render() directly */
    });

    this.getViewportRows = options.getViewportRows ?? ((): number => 24);
    this.pending = new PendingPermissions();
    this.menu = new MenuList({
      rows: () => this.rows,
      onSelect: (index,) => {
        void this.showDetail(index,);
      },
      vi: true,
    },);
  }

  /** @param width */
  render(width: number,): readonly string[] {
    const viewport = Math.max(10, this.getViewportRows(),);
    const bodyHeight = Math.max(1, viewport - 3,);
    const listHeight = Math.max(3, Math.trunc(bodyHeight / 2,),);
    this.menu.setHeight(listHeight - 2,); // minus the list's own frame

    const body: string[] = [];
    const inner = Math.max(0, width - 2,);
    body.push(...this.pending.render(inner, this.pendingFocus,),);

    const pendingError = this.failure ? null : this.pending.loadError();
    if (pendingError !== null) {
      body.push(`{red-fg}Pending requests unavailable: ${escapeMarkup(pendingError,)}{/red-fg}`,);
    }

    if (this.failure) {
      body.push(`{red-fg}${this.failure}{/red-fg}`,);
    } else if (this.rows.length === 0) {
      body.push(formatEmptyRuns(),);
    } else {
      // The run list is a plain menu block; an inner frame would force ANSI
      // rows through a second border pass and invite width drift.
      body.push(`{bold}Runs${this.pendingFocus ? "" : " ←"}{/bold}`, ...this.menu.render(inner,),);
    }

    for (const line of this.detailLines) {
      body.push(truncateToWidth(line, inner,),);
    }

    while (body.length < bodyHeight) { body.push("",); }

    return renderFramed({ title: "Harness Runs", rows: body, width, color: "cyan", },);
  }

  /** @param data - raw key data from pi-tui */
  handleInput(data: string,): void {
    if (!this.visibleFlag) { return; }

    if (data === APPROVE_KEY || data === DENY_KEY) {
      void this.decidePending(data === APPROVE_KEY ? "approve" : "deny",);
      return;
    }

    if (data === "\t" || matchesKey(data, "tab",)) {
      this.pendingFocus = !this.pendingFocus;
      this.requestRender();
      return;
    }

    if (this.pendingFocus && this.pending.hasItems()) {
      this.pending.handleInput(data,);
    } else {
      this.menu.handleInput(data,);
    }

    this.requestRender();
  }

  /** Show the overlay. */
  show(): void {
    this.visibleFlag = true;
    this.requestRender();
  }

  /** Hide the overlay. */
  hide(): void {
    this.visibleFlag = false;
    this.requestRender();
  }

  /** Toggle overlay visibility; opening refreshes the run list. */
  toggle(): void {
    if (this.visibleFlag) {
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
    if (!this.visibleFlag) { return false; }
    this.hide();
    return true;
  }

  /** @returns whether the overlay is currently shown */
  isVisible(): boolean {
    return this.visibleFlag;
  }

  /** Reload the run list (and the first run's detail, or the stats line). */
  async refresh(): Promise<void> {
    await this.pending.load(this.sessionToken,);
    const result = await loadRuns(RUN_LIMIT, this.sessionToken,);
    if (!result.ok) {
      this.runs = [];
      this.rows = [];
      this.menu.resetCursor();
      this.failure = result.error;
      this.detailLines = [];
      this.requestRender();
      return;
    }

    this.failure = null;
    this.runs = result.data.items;
    this.menu.resetCursor();
    this.renderList();

    if (this.runs.length > 0) {
      void this.showDetail(0,);
    } else {
      const stats = await loadStats(this.sessionToken,);
      if (stats.ok && stats.data) {
        this.detailLines = tagsToAnsi(formatStats(stats.data,),).split("\n",);
        this.requestRender();
      }
    }
  }

  /** @returns the loaded run summaries */
  getRuns(): HarnessRunSummary[] {
    return this.runs;
  }

  /** @returns the parked permission asks, oldest first */
  getPending(): readonly PendingPermission[] {
    return this.pending.getItems();
  }

  /** @returns the highlighted row index */
  getCursor(): number {
    return this.menu.getCursor();
  }

  /**
   * Approve or deny the highlighted pending ask, then re-render.
   * @param decision - `approve` or `deny`
   * @throws never — a failed decision lands on the pending block's message
   */
  private async decidePending(decision: PermissionDecision,): Promise<void> {
    if (!this.pending.hasItems()) { return; }

    await this.pending.decide(decision, this.sessionToken,);
    this.requestRender();
  }

  private renderList(): void {
    if (this.runs.length === 0) {
      this.rows = [];
      return;
    }

    this.rows = this.runs.map((run,) => formatRunLine(run,));
  }

  /**
   * Load one run's detail into the bottom pane.
   * @param index - run row to load
   * @throws never — failures land on the detail pane
   */
  private async showDetail(index: number,): Promise<void> {
    if (this.runs.length === 0) {
      this.detailLines = [];
      this.requestRender();
      return;
    }

    const run = this.runs[index];
    if (!run) { return; }

    const result = await loadRunDetail(run.runId, this.sessionToken,);
    if (!result.ok) {
      this.detailLines = [tagsToAnsi(`{red-fg}Failed to load detail: ${result.error}{/red-fg}`,),];
      this.requestRender();
      return;
    }

    this.detailLines = tagsToAnsi(formatRunDetail(result.data,),).split("\n",);
    this.requestRender();
  }
}
