// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 300

/**
 * TUI Models Overlay (pi-tui)
 *
 * Admin model/provider configuration as a full-screen overlay: three levels —
 * roles, then providers, then that provider's models — because every element
 * here is a list plus a selection, which is the property that makes this
 * surface worth a terminal (see `.tmp/tui-web-parity.md` §3.2). Anything
 * needing a validated text box does not belong here and was left out on
 * purpose: temperature/maxTokens editors, the capabilities registry, plugin
 * toggles, anything destructive.
 *
 * Keybinding is **F6**. F1/F2/F3 are chat picker / assets / harness, F4 is
 * reserved by TASK-harness-topic-tui-surface and F5 is refresh, so F6 is the
 * next free key in the same block.
 *
 * Why `source` is rendered on every row: it is the diagnostic that matters
 * when a generation is behaving badly over ssh with no browser. A role reading
 * `[config]` was never overridden in the DB, so editing it here is the fix.
 */

import { getChildLogger, } from "../logger";
import { tagsToAnsi, } from "./ansi";
import { renderFramed, } from "./frame";
import { MenuList, } from "./menu";
import {
  assignRole,
  clearRole,
  loadProviderModels,
  loadProviders,
  loadRoles,
  rescanProviders,
  testProviderConnection,
} from "./models-api";
import type { ProviderSummary, ResolvedRole, } from "./models-api";
import { formatConnectionTest, providerLine, roleLine, } from "./models-display";
import { type Component, type Focusable, matchesKey, } from "./pi";

/** Which of the three drill-down levels the list is showing. */
type OverlayLevel = "roles" | "providers" | "models";

/** Construction options for {@link ModelsOverlay}. */
export interface ModelsOverlayOptions {
  /** Bearer token for the admin calls; omit to run anonymous. */
  sessionToken?: string;
  /** Repaint hook; the shell routes this to the pi-tui renderer. */
  onRequestRender?: () => void;
  /** Terminal row count source (the shell passes `tui.terminal.rows`). */
  getViewportRows?: () => number;
}

/** Footer hint per level, so the keys on offer are never a guess.
 *
 * Verified against the old bindings: every letter/arrow/Enter key named here
 * is handled in `handleInput`, and `Esc` is not handled at all — it reaches
 * the shell's global dismiss chain and closes the whole overlay from any
 * level. (An earlier draft promised "Esc: back" at the providers and models
 * levels. No such binding existed and none does; the claim was removed rather
 * than shipped, per the no-unverified-hints rule.) */
const HINTS: Record<OverlayLevel, string> = {
  roles: "Up/Down: move | Enter: pick provider | c: clear override | Esc: close",
  providers: "Up/Down: move | Enter: pick model | p: ping | r: rescan | Esc: close",
  models: "Up/Down: move | Enter: assign | Esc: close",
};

/**
 * Full-screen admin overlay for model-role assignment and provider health.
 *
 * A 403 anywhere degrades to the ADMIN_ONLY line in the list rather than an
 * error: a non-admin opening this overlay is a normal state, not a failure.
 */
export class ModelsOverlay implements Component, Focusable {
  focused = false;
  private sessionToken: string | undefined;
  private visibleFlag = false;
  private level: OverlayLevel = "roles";
  private rows: string[] = [];
  /** Rendered in place of the list when loading failed. */
  private failure: string | null = null;
  private roles: ResolvedRole[] = [];
  private providers: ProviderSummary[] = [];
  private modelIds: string[] = [];
  /** Role being reassigned; set while drilling out of the roles level. */
  private targetRole: string | undefined;
  /** Provider whose models are listed; set while drilling out of providers. */
  private targetProvider: string | undefined;
  private statusText = HINTS.roles;
  private readonly menu: MenuList;
  private readonly requestRender: () => void;
  private readonly getViewportRows: () => number;

  /**
   * @param options - bearer token for the admin calls, repaint hooks
   */
  constructor(options: ModelsOverlayOptions = {},) {
    this.sessionToken = options.sessionToken === "" ? undefined : options.sessionToken;
    this.requestRender = options.onRequestRender ?? ((): void => {
      /* no host wired: tests read render() directly */
    });

    this.getViewportRows = options.getViewportRows ?? ((): number => 24);
    this.menu = new MenuList({
      rows: () => this.rows,
      onSelect: () => undefined,
    },);
  }

  /** @param width */
  render(width: number,): readonly string[] {
    const viewport = Math.max(8, this.getViewportRows(),);
    const bodyHeight = Math.max(1, viewport - 3,);
    this.menu.setHeight(bodyHeight,);

    const body: string[] = [];
    if (this.failure) {
      body.push(`{red-fg}${this.failure}{/red-fg}`,);
    } else {
      body.push(...this.menu.render(width - 2,),);
    }

    while (body.length < bodyHeight) { body.push("",); }

    const framed = renderFramed({ title: "Models", rows: body, width, color: "cyan", },);
    return [...framed, ` ${tagsToAnsi(this.statusText,)}`,];
  }

  /** @param data - raw key data from pi-tui */
  handleInput(data: string,): void {
    if (!this.visibleFlag) { return; }

    if (data === "c") {
      void this.onClear();
      return;
    }

    if (data === "r") {
      void this.onRescan();
      return;
    }

    if (data === "p") {
      void this.onPing();
      return;
    }

    if (matchesKey(data, "enter",)) {
      void this.onSelect(this.menu.getCursor(),);
      this.requestRender();
      return;
    }

    this.menu.handleInput(data,);
    this.requestRender();
  }

  /** Show the overlay at the roles level and load them. */
  show(): void {
    this.visibleFlag = true;
    this.level = "roles";
    this.menu.resetCursor();
    this.targetRole = undefined;
    this.targetProvider = undefined;
    this.requestRender();
    void this.refreshRoles();
  }

  /** Hide the overlay without changing any assignment. */
  hide(): void {
    this.visibleFlag = false;
    this.requestRender();
  }

  /**
   * Close the overlay if it is open. The app calls this from its global Esc/q
   * handler so an open overlay swallows the key instead of quitting.
   * @returns true when the overlay was visible and has now been hidden
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
    this.rows = rows;
    this.failure = null;
    this.menu.resetCursor();
    this.statusText = `${rows.length} | ${HINTS[this.level]}`;
    this.requestRender();
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
      await this.refreshProviders();
      return;
    }

    if (this.level === "providers") {
      const provider = this.providers[index];
      if (!provider) { return; }
      this.targetProvider = provider.name;
      this.level = "models";
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
    this.menu.resetCursor();
    this.targetRole = undefined;
    this.targetProvider = undefined;
    await this.refreshRoles();
    this.showStatus(`${role} -> ${provider} / ${model}`,);
  }

  /** DELETE the focused role's override, falling back to config then default. */
  private async onClear(): Promise<void> {
    if (this.level !== "roles") { return; }

    const role = this.roles[this.menu.getCursor()]?.role;
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
    this.statusText = message;
    this.requestRender();
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
   * Ping the focused provider and show the verdict.
   *
   * The ping route needs only a user id, not `admin.system` — but reaching a
   * provider row at all means the admin-gated list already rendered, so in
   * practice a non-admin sees the "admin only" line and never gets here. The
   * guard below is the belt to that braces: an explicit message rather than a
   * silent no-op if the list is ever shown from an ungated source.
   */
  private async onPing(): Promise<void> {
    if (this.level !== "providers") {
      this.showStatus("press p on a provider row",);
      return;
    }

    const provider = this.providers[this.menu.getCursor()];
    if (!provider) {
      this.showStatus("no provider selected",);
      return;
    }

    this.showStatus(`pinging ${provider.name}...`,);
    const result = await testProviderConnection({
      provider: provider.name,
      sessionToken: this.sessionToken,
    },);

    // A failed health check still answers HTTP 200 with ok:false, so reaching
    // this branch means the request completed — read the verdict, not `ok`.
    this.showStatus(result.ok ? formatConnectionTest(result.data,) : result.error,);
  }

  /**
   * Replace the list with a message in place of data (403 and friends).
   * @param message - already user-facing text from the result union
   */
  private renderFailure(message: string,): void {
    this.rows = [];
    this.failure = message;
    this.statusText = HINTS[this.level];
    getChildLogger("tui",)?.warn("tui: models overlay fetch failed", { level: this.level, message, },);
    this.requestRender();
  }
}
