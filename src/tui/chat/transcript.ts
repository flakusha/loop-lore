// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat transcript pane — a `ScrollView` with follow-tail scrolling plus the
 * `Focusable` surface Tab switches to (ScrollView itself is not focusable).
 * Arrow/Page/Home/End keys scroll while focused, like the old blessed list.
 */

import { type Component, type Focusable, matchesKey, ScrollView, } from "../pi";

/** */
export class TranscriptPane implements Component, Focusable {
  focused = false;
  readonly scroll: ScrollView;

  /** */
  constructor() {
    this.scroll = new ScrollView([], {
      height: 10,
      scrollbar: true,
      followTail: true,
      anchor: "end",
    },);
  }

  /**
   * @param height - viewport height for the next render
   */
  setHeight(height: number,): void {
    this.scroll.setHeight(height,);
  }

  /** @param width */
  render(width: number,): readonly string[] {
    return this.scroll.render(width,);
  }

  /**
   * Scroll keys while focused. Follow-tail re-engages when the viewport is
   * back at the tail, so scrolling up pauses auto-scroll and End resumes it.
   * @param data - raw key data from pi-tui
   */
  handleInput(data: string,): void {
    const scroll = this.scroll;
    const offset = scroll.getScrollOffset();
    if (matchesKey(data, "up",)) {
      scroll.setScrollOffset(offset - 1,);
    } else if (matchesKey(data, "down",)) {
      scroll.setScrollOffset(offset + 1,);
    } else if (matchesKey(data, "pageUp",)) {
      scroll.setScrollOffset(offset - 10,);
    } else if (matchesKey(data, "pageDown",)) {
      scroll.setScrollOffset(offset + 10,);
    } else if (matchesKey(data, "home",)) {
      scroll.scrollToTop();
    } else if (matchesKey(data, "end",)) {
      scroll.scrollToBottom();
    }
  }
}
