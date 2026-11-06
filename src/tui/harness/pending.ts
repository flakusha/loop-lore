// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pending permission queue for the harness overlay: the parked asks, the
 * approve/deny keys and the rendered block. Pure client state — the HTTP
 * calls live in ./api and the row formatting in ./display.
 */
import { escapeMarkup, } from "../markup";
import { MenuList, } from "../menu";
import {
  decidePermission,
  loadPendingPermissions,
  type PendingPermission,
  type PermissionDecision,
} from "./api";
import { formatPendingPermission, } from "./display";

/** Key that approves the highlighted ask. */
export const APPROVE_KEY = "a";
/** Key that denies the highlighted ask. */
export const DENY_KEY = "d";
/** How many asks the block shows at once. */
const MAX_VISIBLE = 5;

/**
 * The parked asks plus the operator's approve/deny action keys.
 */
export class PendingPermissions {
  private items: PendingPermission[] = [];
  /** Last failure (load or decision), rendered as a message, never thrown. */
  private error: string | null = null;
  /** True while a decision is in flight — a second keypress must not re-post it. */
  private deciding = false;
  private readonly menu: MenuList;

  constructor() {
    this.menu = new MenuList({
      rows: () => this.rows(),
      onSelect: () => {
        /* the overlay decides on explicit keys, not on Enter */
      },
      vi: true,
    },);

    this.menu.setHeight(MAX_VISIBLE,);
  }

  /** @returns the parked asks, oldest first */
  getItems(): PendingPermission[] {
    return this.items;
  }

  /** @returns the ask the approve/deny keys act on */
  highlighted(): PendingPermission | undefined {
    return this.items[this.menu.getCursor()];
  }

  /** @returns true when at least one ask is parked */
  hasItems(): boolean {
    return this.items.length > 0;
  }

  /**
   * Load the queue.
   * @param sessionToken - admin session token
   * @throws never — a failure lands on the rendered message
   */
  async load(sessionToken: string | undefined,): Promise<void> {
    const result = await loadPendingPermissions(sessionToken,);
    if (!result.ok) {
      this.items = [];
      this.error = result.error;
      this.menu.resetCursor();
      return;
    }

    this.error = null;
    // The payload is not schema-validated on the TUI side (the web surface
    // validates it); a malformed body must not leave the queue undefined.
    this.items = Array.isArray(result.data.items,) ? result.data.items : [];
    this.menu.resetCursor();
  }

  /**
   * Decide the highlighted ask, then reload the queue.
   * @param decision - `approve` or `deny`
   * @param sessionToken - admin session token
   * @throws never — a failure lands on the rendered message
   */
  async decide(decision: PermissionDecision, sessionToken: string | undefined,): Promise<void> {
    const target = this.highlighted();
    if (!target) { return; }

    // One decision at a time. The queue drops the ask once it is decided, so
    // a second keypress while the first is in flight would race it into a
    // 404 — the same guard the web panel keeps on its buttons.
    if (this.deciding) { return; }

    this.deciding = true;
    try {
      const result = await decidePermission(target.id, decision, sessionToken,);
      if (!result.ok) {
        this.error = result.error;
        return;
      }

      await this.load(sessionToken,);
    } finally {
      this.deciding = false;
    }
  }

  /** Route the navigation keys to the pending cursor. */
  handleInput(data: string,): void {
    this.menu.handleInput(data,);
  }

  /**
   * The load error, when the queue could not be read at all.
   * @returns the message, or null when the queue loaded fine
   */
  loadError(): string | null {
    return this.items.length === 0 ? this.error : null;
  }

  /**
   * Render the pending block: header, the asks and the key hint.
   * @param width - inner width of the overlay frame
   * @param focused - true when the Up/Down cursor is on this list
   * @returns the block rows, empty when nothing is parked
   */
  render(width: number, focused: boolean,): readonly string[] {
    if (this.items.length === 0) { return []; }

    const marker = focused ? " ←" : "";
    const lines: string[] = [
      `{bold}Pending requests${marker}{/bold}`,
      ...this.menu.render(width,),
    ];

    if (this.error !== null) {
      lines.push(`{red-fg}Last action failed: ${escapeMarkup(this.error,)}{/red-fg}`,);
    }

    lines.push(
      `{gray-fg}[${APPROVE_KEY}] approve  [${DENY_KEY}] deny  [Tab] switch list{/gray-fg}`,
    );

    return lines;
  }

  private rows(): string[] {
    return this.items.map((item,) => formatPendingPermission(item,));
  }
}
