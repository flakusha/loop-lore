// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI Chat Picker
 *
 * Toggleable overlay listing the caller's chats so one can be bound to the
 * chat + asset views. Mirrors `harness/index.ts`: a full-screen blessed box
 * holding a list plus a status label, with a `setFetch` seam for tests.
 *
 * Data comes from GET /api/v1/chats (src/routes/chats/list.ts), which is
 * auth-guarded and answers `{ data, pagination, meta }` with `selectAll()`
 * chat rows.
 *
 * Keybinding is F1: F2/F3 are taken, F4 is reserved by
 * TASK-harness-topic-tui-surface, F5 is refresh. Esc dismisses WITHOUT
 * quitting — `dismiss()` reports whether it consumed the key, and the app's
 * global Esc/q/Ctrl-C handler only shuts down when it returns false.
 */

import blessed from "blessed";
import { safeFetch, } from "../utils";
import { API_BASE, } from "./chat";

/** One row of GET /api/v1/chats, narrowed to what the picker renders. */
export interface ChatSummary {
  id: string;
  name: string;
  type?: string | null;
  is_pinned?: string | null;
  updated_at?: string | null;
}

/** Envelope shape returned by GET /api/v1/chats. */
export interface ChatListEnvelope {
  data: ChatSummary[];
}

/** Result of a chat-list fetch, mirroring the harness API module. */
export type ChatListResult =
  | { ok: true; data: ChatSummary[] }
  | { ok: false; error: string };

/** Row rendered when the account has no chats. */
export const NO_CHATS_MESSAGE = "No chats yet. Create one in the web client.";

let _fetch = safeFetch;

/**
 * Swap the chat-list fetcher. Tests use this instead of `mock.module`.
 * @param fn
 */
export function setFetch(fn: typeof safeFetch,): void {
  _fetch = fn;
}

/**
 * Fetch the caller's chats, most recently updated first.
 * @param sessionToken - bearer token; omit to run anonymous
 * @returns the chats, or an error message to render in place of the list
 */
export async function loadChats(sessionToken: string | undefined,): Promise<ChatListResult> {
  try {
    const result = await _fetch<ChatListEnvelope>(
      `${API_BASE}/api/v1/chats?sort=recent&pageSize=50`,
      {
        auth: sessionToken ? { sessionToken, } : undefined,
        handle401: false,
      },
    );

    if (!result.ok) { return { ok: false, error: `HTTP ${result.status}`, }; }

    return { ok: true, data: result.data.data ?? [], };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }
}

/** Construction options for {@link ChatPicker}. */
export interface ChatPickerOptions {
  /** Bearer token for the chat-list call. */
  sessionToken?: string;
  /** Invoked with the chosen chat id when the user commits a row. */
  onSelect: (chatId: string,) => void;
}

/**
 * Full-screen chat picker overlay.
 *
 * Binding a row never touches the views itself: it reports the id through
 * `onSelect` so the app owns the single binding path (chat + assets +
 * message reload), which is what keeps the two views consistent.
 */
export class ChatPicker {
  private screen: blessed.Widgets.Screen;
  private box: blessed.Widgets.BoxElement;
  private list: blessed.Widgets.ListElement;
  private statusLabel: blessed.Widgets.BlessedElement;
  private chats: ChatSummary[] = [];
  private visible = false;
  private sessionToken: string | undefined;
  private onSelect: (chatId: string,) => void;

  /**
   * @param screen
   * @param options - session token and the selection callback
   */
  constructor(screen: blessed.Widgets.Screen, options: ChatPickerOptions,) {
    this.screen = screen;
    this.sessionToken = options.sessionToken === "" ? undefined : options.sessionToken;
    this.onSelect = options.onSelect;

    this.box = blessed.box({
      parent: screen,
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      label: " {bold}Chats{/bold} ",
      tags: true,
      border: { type: "line", },
      style: { bg: "black", fg: "white", border: { fg: "magenta", }, },
      hidden: true,
    },);

    this.list = blessed.list({
      parent: this.box,
      top: 0,
      left: 1,
      right: 1,
      bottom: 2,
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      border: { type: "line", },
      style: {
        selected: { bg: "magenta", fg: "black", },
        item: { fg: "white", },
      },
    },);

    this.statusLabel = blessed.text({
      parent: this.box,
      bottom: 0,
      left: 1,
      right: 1,
      height: 1,
      tags: true,
      content: "Enter: bind chat | Esc: close",
      style: { fg: "gray", },
    },);

    // blessed hands `select` the row INDEX (lib/widgets/list.js:586). The row
    // content is the FORMATTED line, which carries no reliable id, so index
    // into `chats` — the same lesson harness/index.ts learned the hard way.
    this.list.on("select", (_el: blessed.Widgets.BlessedElement, index: number,) => {
      const chat = this.chats[index];
      if (chat) { this.onSelect(chat.id,); }
    },);
  }

  /** Show the overlay and load the chat list. */
  show(): void {
    this.visible = true;
    this.box.show();
    this.list.focus();
    this.screen.render();
    void this.refresh();
  }

  /** Hide the overlay without touching the bound chat. */
  hide(): void {
    this.visible = false;
    this.box.hide();
    this.screen.render();
  }

  /**
   * Close the picker if it is open. The app calls this from its global
   * Esc/q/Ctrl-C handler so an open overlay swallows the key instead of
   * quitting the process.
   * @returns true when the picker was visible and has now been hidden
   */
  dismiss(): boolean {
    if (!this.visible) { return false; }
    this.hide();
    return true;
  }

  /**
   * @returns whether the overlay is currently shown
   */
  isVisible(): boolean {
    return this.visible;
  }

  /** Reload chats from the API and re-render the list. */
  async refresh(): Promise<void> {
    const result = await loadChats(this.sessionToken,);

    if (!result.ok) {
      this.chats = [];
      this.list.setItems([],);
      this.list.setContent(`Failed to load chats: ${result.error}`,);
      this.statusLabel.setContent("Esc: close",);
      this.screen.render();
      return;
    }

    this.chats = result.data;
    if (this.chats.length === 0) {
      this.list.setItems([],);
      this.list.setContent(NO_CHATS_MESSAGE,);
      this.statusLabel.setContent(NO_CHATS_MESSAGE,);
    } else {
      this.list.setItems(
        this.chats.map(
          (chat,) =>
            `${chat.is_pinned === "pinned" ? "{bold-fg3}[pinned]{/bold-fg3} " : ""}${
              chat.name || "(unnamed)"
            }  {gray}(${chat.id.slice(0, 8,)}…){/gray}`,
        ),
      );

      this.list.setContent("",);
      this.statusLabel.setContent(
        `${this.chats.length} chat(s) | Enter: bind chat | Esc: close`,
      );
    }

    this.screen.render();
  }
}
