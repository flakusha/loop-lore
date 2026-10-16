// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 265

/**
 * TUI Models Overlay
 *
 * Admin model/provider configuration, shaped exactly like `chat-picker.ts`:
 * one full-screen `blessed.box` holding a list plus a status label, no second
 * screen framework. Three levels — roles, then providers, then that provider's
 * models — because every element here is a list plus a selection, which is the
 * property that makes this surface worth a terminal (see `.tmp/tui-web-parity.md`
 * §3.2). Anything needing a validated text box does not belong here and was
 * left out on purpose: temperature/maxTokens editors, the capabilities
 * registry, plugin toggles, anything destructive.
 *
 * Keybinding is **F6**. F1/F2/F3 are chat picker / assets / harness, F4 is
 * reserved by TASK-harness-topic-tui-surface and F5 is refresh, so F6 is the
 * next free key in the same block — grouping it with the other view toggles
 * rather than inventing a Ctrl- or letter-combo binding that would collide with
 * the list's vi keys (`j`/`k`/`g`/`q`) inside the overlay.
 *
 * Why `source` is rendered on every row: it is the diagnostic that matters when
 * a generation is behaving badly over ssh with no browser. A role reading
 * `[config]` was never overridden in the DB, so editing it here is the fix.
 */

import blessed from "blessed";
import { getChildLogger, } from "../logger";
import {
  assignRole,
  clearRole,
  loadProviderModels,
  loadProviders,
  loadRoles,
  rescanProviders,
} from "./models-api";
import type { ProviderSummary, ResolvedRole, } from "./models-api";
import { providerLine, roleLine, } from "./models-display";

/** Which of the three drill-down levels the list is showing. */
type OverlayLevel = "roles" | "providers" | "models";

/** Construction options for {@link ModelsOverlay}. */
export interface ModelsOverlayOptions {
  /** Bearer token for the admin calls; omit to run anonymous. */
  sessionToken?: string;
}

/** Footer hint per level, so the keys on offer are never a guess. */
const HINTS: Record<OverlayLevel, string> = {
  roles: "Enter: pick provider | c: clear override | Esc: close",
  providers: "Enter: pick model | r: rescan | Esc: back",
  models: "Enter: assign | Esc: back",
};

/**
 * Full-screen admin overlay for model-role assignment and provider health.
 *
 * A 403 anywhere degrades to the ADMIN_ONLY line in the list rather than an
 * error: a non-admin opening this overlay is a normal state, not a failure.
 */
export class ModelsOverlay {
  private screen: blessed.Widgets.Screen;
  private box: blessed.Widgets.BoxElement;
  private list: blessed.Widgets.ListElement;
  private statusLabel: blessed.Widgets.BlessedElement;
  private sessionToken: string | undefined;
  private visible = false;
  private level: OverlayLevel = "roles";
  /** Highlighted row within the current level; blessed's own `selected` is not
   * on the ListElement type, so the cursor is tracked here like HarnessView's
   * `currentIndex` and pushed into the list with `select()`. */
  private cursor = 0;
  private roles: ResolvedRole[] = [];
  private providers: ProviderSummary[] = [];
  private modelIds: string[] = [];
  /** Role being reassigned; set while drilling out of the roles level. */
  private targetRole: string | undefined;
  /** Provider whose models are listed; set while drilling out of providers. */
  private targetProvider: string | undefined;

  /**
   * @param screen - surface the overlay is drawn on
   * @param options - bearer token for the admin calls
   */
  constructor(screen: blessed.Widgets.Screen, options: ModelsOverlayOptions = {},) {
    this.screen = screen;
    this.sessionToken = options.sessionToken === "" ? undefined : options.sessionToken;

    this.box = blessed.box({
      parent: screen,
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      label: " {bold}Models{/bold} ",
      tags: true,
      border: { type: "line", },
      style: { bg: "black", fg: "white", border: { fg: "cyan", }, },
      hidden: true,
    },);

    this.list = blessed.list({
      parent: this.box,
      top: 0,
      left: 1,
      right: 1,
      bottom: 2,
      tags: true,
      // keys/vi off: blessed's own arrow handling would move its selection
      // alongside the tracked `cursor`, so Enter and `c` would act on a
      // different row than the highlight on screen. `cursor` is the only
      // selection state; every key is bound on the box below.
      keys: false,
      vi: false,
      mouse: true,
      border: { type: "line", },
      style: { selected: { bg: "cyan", fg: "black", }, item: { fg: "white", }, },
    },);

    this.statusLabel = blessed.text({
      parent: this.box,
      bottom: 0,
      left: 1,
      right: 1,
      height: 1,
      tags: true,
      content: HINTS.roles,
      style: { fg: "gray", },
    },);

    this.list.on("select", (_el: blessed.Widgets.BlessedElement, index: number,) => {
      // Mouse click only — with `keys: false` blessed does not raise this for
      // Enter, which is bound on the box below. Honour the clicked row so a
      // mouse press does not act on whatever the arrow keys last left lit.
      this.cursor = index;
      void this.onSelect(index,);
    },);

    // `c` clears the focused role's override; `r` re-scans providers. Bound on
    // the box rather than the screen so they only fire while the overlay has
    // focus, and so they cannot shadow the chat input's keys.
    this.box.key(["c",], () => {
      void this.onClear();
    },);

    this.box.key(["r",], () => {
      void this.onRescan();
    },);

    // Arrow keys move a tracked cursor rather than blessed's own selection, so
    // `c` and Enter always agree on which row they mean. Clamped, so holding a
    // key at either end is a no-op rather than an out-of-range read.
    this.box.key(["up",], () => {
      this.moveCursor(-1,);
    },);

    this.box.key(["down",], () => {
      this.moveCursor(1,);
    },);

    // Enter acts on `cursor`, the same row `c` reads, so the highlight on
    // screen is always the row the keystroke applies to.
    this.box.key(["enter",], () => {
      void this.onSelect(this.cursor,);
    },);
  }

  /**
   * Move the cursor by `delta` rows, clamped to the current level's list.
   * @param delta - rows to move; negative moves up
   */
  private moveCursor(delta: number,): void {
    const count = this.currentRows();
    if (count === 0) { return; }

    this.cursor = Math.max(0, Math.min(count - 1, this.cursor + delta,),);
    this.list.select(this.cursor,);
    this.screen.render();
  }

  /** @returns how many rows the current level is showing */
  private currentRows(): number {
    if (this.level === "roles") { return this.roles.length; }
    if (this.level === "providers") { return this.providers.length; }

    return this.modelIds.length;
  }

  /** Show the overlay at the roles level and load them. */
  show(): void {
    this.visible = true;
    this.level = "roles";
    this.cursor = 0;
    this.targetRole = undefined;
    this.targetProvider = undefined;
    this.box.show();
    this.list.focus();
    this.screen.render();
    void this.refreshRoles();
  }

  /** Hide the overlay without changing any assignment. */
  hide(): void {
    this.visible = false;
    this.box.hide();
    this.screen.render();
  }

  /**
   * Close the overlay if it is open. The app calls this from its global Esc/q
   * handler so an open overlay swallows the key instead of quitting.
   * @returns true when the overlay was visible and has now been hidden
   */
  dismiss(): boolean {
    if (!this.visible) { return false; }
    this.hide();
    return true;
  }

  /** @returns whether the overlay is currently shown */
  isVisible(): boolean {
    return this.visible;
  }

  /** Reload whichever level is showing, from the top of the drill-down. */
  async refresh(): Promise<void> {
    if (this.level === "roles") {
      await this.refreshRoles();
    } else {
      await this.refreshProviders();
    }
  }

  /** Load roles and render them with their `source`. */
  private async refreshRoles(): Promise<void> {
    const result = await loadRoles(this.sessionToken,);
    if (!result.ok) {
      this.renderFailure(result.error,);
      return;
    }

    this.roles = result.data.roles ?? [];
    this.renderRows(this.roles.map(roleLine,),);
  }

  /** Load providers with their health snapshot and render them. */
  private async refreshProviders(): Promise<void> {
    const result = await loadProviders(this.sessionToken,);
    if (!result.ok) {
      this.renderFailure(result.error,);
      return;
    }

    this.providers = result.data.providers ?? [];
    this.renderRows(this.providers.map(providerLine,),);
  }

  /**
   * Load one provider's model ids and render them.
   * @param provider - provider whose catalogue to list
   */
  private async refreshModels(provider: string,): Promise<void> {
    const result = await loadProviderModels({ provider, sessionToken: this.sessionToken, },);
    if (!result.ok) {
      this.renderFailure(result.error,);
      return;
    }

    this.modelIds = (result.data.models ?? []).map((m,) => m.id);
    this.renderRows(this.modelIds,);
  }

  /**
   * Swap in a level's rows and repaint. Every level ends a load the same way,
   * so the three refresh methods above differ only in what they fetched and how
   * the rows are shaped.
   * @param rows - already-formatted lines for the current level
   */
  private renderRows(rows: string[],): void {
    this.list.setItems(rows,);
    this.list.setContent("",);
    this.renderFooter(rows.length,);
    this.screen.render();
  }

  /**
   * Drill one level in from whichever list is showing.
   * @param index - row the user picked in the current level
   */
  private async onSelect(index: number,): Promise<void> {
    if (this.level === "roles") {
      const role = this.roles[index];
      if (!role) { return; }
      this.targetRole = role.role;
      this.level = "providers";
      this.cursor = 0;
      await this.refreshProviders();
      return;
    }

    if (this.level === "providers") {
      const provider = this.providers[index];
      if (!provider) { return; }
      this.targetProvider = provider.name;
      this.level = "models";
      this.cursor = 0;
      await this.refreshModels(provider.name,);
      return;
    }

    const model = this.modelIds[index];
    if (!model) { return; }
    await this.commit(model,);
  }

  /**
   * PUT the selected provider/model pair onto the role, then reload roles.
   * @param model - model id chosen from the provider's catalogue
   */
  private async commit(model: string,): Promise<void> {
    const role = this.targetRole;
    const provider = this.targetProvider;
    if (!role || !provider) { return; }

    const result = await assignRole({
      role,
      provider,
      model,
      sessionToken: this.sessionToken,
    },);

    if (!result.ok) {
      this.showStatus(result.error,);
      return;
    }

    this.level = "roles";
    this.cursor = 0;
    this.targetRole = undefined;
    this.targetProvider = undefined;
    await this.refreshRoles();
    this.showStatus(`${role} -> ${provider} / ${model}`,);
  }

  /** DELETE the focused role's override, falling back to config then default. */
  private async onClear(): Promise<void> {
    if (this.level !== "roles") { return; }

    const role = this.roles[this.cursor]?.role;
    if (!role) { return; }

    const result = await clearRole({ role, sessionToken: this.sessionToken, },);
    if (!result.ok) {
      this.showStatus(result.error,);
      return;
    }

    await this.refreshRoles();
    this.showStatus(`${role} override cleared`,);
  }

  /**
   * Put a one-line outcome in the footer. Every mutating key ends here, so a
   * failed write and a successful one land in the same place.
   * @param message - text to show in place of the level's key hints
   */
  private showStatus(message: string,): void {
    this.statusLabel.setContent(message,);
    this.screen.render();
  }

  /** POST a provider re-scan and refresh the provider list in place. */
  private async onRescan(): Promise<void> {
    const result = await rescanProviders(this.sessionToken,);
    if (!result.ok) {
      this.showStatus(result.error,);
      return;
    }

    if (this.level === "providers") { await this.refreshProviders(); }
    else { await this.refreshRoles(); }

    this.showStatus("providers rescanned",);
  }

  /**
   * Replace the list with a message in place of data (403 and friends).
   * @param message - already user-facing text from the result union
   */
  private renderFailure(message: string,): void {
    this.list.setItems([],);
    this.list.setContent(`{red-fg}${message}{/red-fg}`,);
    this.statusLabel.setContent(HINTS[this.level],);
    getChildLogger("tui",)?.warn("tui: models overlay fetch failed", { level: this.level, message, },);
    this.screen.render();
  }

  /**
   * Set the footer to the current level's keys plus a row count.
   * @param count - rows currently listed
   */
  private renderFooter(count: number,): void {
    this.statusLabel.setContent(`${count} | ${HINTS[this.level]}`,);
  }
}
