// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Menu list — the shared replacement for the blessed `list` widgets.
 *
 * A vertical list of pre-formatted rows with a cursor, Up/Down (plus optional
 * vi `j`/`k`) navigation and Enter selection. pi-tui's `SelectList` was
 * considered and rejected: it owns a type-to-filter input, which would change
 * the pickers' UX (letters like `c`/`p`/`r` are action keys there, not filter
 * text). This component keeps the exact key surface the overlays had.
 */

import { tagsToAnsi, } from "./ansi";
import { type Component, type Focusable, matchesKey, padding, visibleWidth, } from "./pi";

/** Construction options for {@link MenuList}. */
export interface MenuListOptions {
  /** Current rows, already formatted (blessed-tagged; converted here). */
  rows: () => string[];
  /** Invoked with the row index on Enter. */
  onSelect: (index: number,) => void;
  /** Bind `j`/`k` as Up/Down (the old widgets' `vi: true`). */
  vi?: boolean;
}

/** */
export class MenuList implements Component, Focusable {
  focused = false;
  /** Highlighted row; the owner reads it for its own action keys. */
  cursor = 0;
  readonly #rows: () => string[];
  readonly #onSelect: (index: number,) => void;
  readonly #vi: boolean;
  /** Top visible row when the list outgrows the viewport. */
  #scrollOffset = 0;
  #height = 10;

  /**
   * @param options - rows source, selection callback, vi keys
   */
  constructor(options: MenuListOptions,) {
    this.#rows = options.rows;
    this.#onSelect = options.onSelect;
    this.#vi = options.vi ?? false;
  }

  /** Clamp the cursor after the row source changed size. */
  resetCursor(): void {
    this.cursor = 0;
    this.#scrollOffset = 0;
  }

  /**
   * @param height - viewport height the next render will use
   */
  setHeight(height: number,): void {
    this.#height = Math.max(1, height,);
  }

  /**
   * @returns currently highlighted row index
   */
  getCursor(): number {
    return this.cursor;
  }

  /**
   * @param index - row to highlight, clamped to the row range
   */
  setCursor(index: number,): void {
    const count = this.#rows().length;
    if (count === 0) { return; }
    this.cursor = Math.max(0, Math.min(count - 1, index,),);
  }

  /** @param width */
  render(width: number,): readonly string[] {
    const raw = this.#rows();
    if (raw.length === 0) { return []; }
    if (this.cursor < this.#scrollOffset) { this.#scrollOffset = this.cursor; }
    if (this.cursor >= this.#scrollOffset + this.#height) {
      this.#scrollOffset = this.cursor - this.#height + 1;
    }

    const end = Math.min(raw.length, this.#scrollOffset + this.#height,);
    const rows: string[] = [];
    for (let i = this.#scrollOffset; i < end; i++) {
      const line = tagsToAnsi(raw[i]!,);
      const marker = i === this.cursor ? "> " : "  ";
      // Highlight the cursor row like blessed's `selected` style: cyan
      // background, black foreground, padded to the full row width.
      if (i === this.cursor) {
        const pad = Math.max(0, width - 2 - visibleWidth(line,),);
        rows.push(`\x1b[30m\x1b[46m${marker}${line}${padding(pad,)}\x1b[0m`,);
      } else {
        rows.push(`${marker}${line}`,);
      }
    }

    return rows;
  }

  /**
   * Up/Down/Enter (plus vi `j`/`k` when enabled). Other keys are ignored so
   * the owning overlay's own action keys keep working.
   * @param data - raw key data from pi-tui
   */
  handleInput(data: string,): void {
    const count = this.#rows().length;
    if (count === 0) { return; }
    if (matchesKey(data, "up",) || (this.#vi && data === "k")) {
      this.cursor = (this.cursor - 1 + count) % count;
    } else if (matchesKey(data, "down",) || (this.#vi && data === "j")) {
      this.cursor = (this.cursor + 1) % count;
    } else if (matchesKey(data, "enter",)) {
      this.#onSelect(this.cursor,);
    }
  }
}
