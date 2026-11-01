// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 410

/**
 * TUI Chat Picker (pi-tui)
 *
 * Full-screen overlay listing the user's chats; Enter binds the chat through
 * the host's `onSelect` (the same `ChatWidget.setChatId` path the web client
 * uses), `c` opens an inline create-chat prompt. Shown by the shell via
 * `TUI.showOverlay(this, { fullscreen: true })`; the shell also routes its
 * global Esc chain through `dismiss()`.
 */

import { safeFetch, } from "../utils";
import { tagsToAnsi, } from "./ansi";
import { API_BASE, } from "./chat";
import { createChat, } from "./chat-create-api";
import { ChatInputField, } from "./chat/input-field";
import { renderFramed, } from "./frame";
import { escapeMarkup, } from "./markup";
import { MenuList, } from "./menu";
import { type Component, type Focusable, matchesKey, } from "./pi";

/** One row of GET /api/v1/chats, narrowed to what the picker renders. */
export interface ChatSummary {
  id: string;
  name: string;
  type?: string | null;
  is_pinned?: string | null;
  updated_at?: string | null;
}

/**
 * Leading marker for a chat row, or an empty string.
 *
 * `is_pinned` is the PinnedState enum (src/db/enums-core/flags.ts): `archived`
 * is a third state, and rendering it bare listed archived chats as live ones.
 * @param state - the row's `is_pinned` value, when the route returned one
 * @returns the marker to prefix the row with
 */
function pinnedTag(state: string | null | undefined,): string {
  switch (state) {
    case "pinned":
      return "{bold-fg3}[pinned]{/bold-fg3} ";
    case "archived":
      return "{gray}[archived]{/gray} ";
    default:
      return "";
  }
}

/** Envelope shape returned by GET /api/v1/chats. */
export interface ChatListEnvelope {
  data: ChatSummary[];
}

/** Result of a chat-list fetch, mirroring the harness API module. */
export type ChatListResult =
  | { ok: true; data: ChatSummary[] }
  | { ok: false; error: string };

/** Empty-state row. */
export const NO_CHATS_MESSAGE = "No chats yet | c: create";

/** Status line while the create prompt is open; `c` is bound on the list. */
export const CREATE_STATUS = "New chat name | Enter: create | Esc: cancel";

/** Status line for a commit already in flight; the prompt is gone. */
export const CREATING_STATUS = "Creating…";

/** Status line on the template step; Enter uses the highlight, Esc skips it. */
export const CREATE_TEMPLATE_STATUS = "Template | Enter: use | Esc: skip";

/** One row of GET /api/v1/chat-setup-templates, narrowed to the picker. */
export interface ChatPickerTemplate {
  id: string;
  name: string;
}

let _fetch = safeFetch;
let _createChat = createChat;

/**
 * Swap the chat-list fetcher. Tests use this instead of `mock.module`.
 * @param fn
 */
export function setFetch(fn: typeof safeFetch,): void {
  _fetch = fn;
}

/**
 * Swap the chat-create caller. Tests use this instead of `mock.module`,
 * which leaks across files in a shared bun process.
 * @param fn
 */
export function setCreateChat(fn: typeof createChat,): void {
  _createChat = fn;
}

/** Keys the shell owns even while an overlay is focused. */
const SHELL_F_KEYS = ["f1", "f2", "f3", "f5", "f6",] as const;

/**
 * Fetch the caller's chats, most recently updated first.
 * @param sessionToken - bearer token; omit to run anonymous
 * @returns the chats, or an error message to render in place of the list
 * @throws never — network failures come back on the error arm
 */
export async function loadChats(sessionToken: string | undefined,): Promise<ChatListResult> {
  try {
    const result = await _fetch<ChatListEnvelope>(`${API_BASE}/api/v1/chats`, {
      auth: sessionToken ? { sessionToken, } : undefined,
      handle401: false,
    },);

    if (!result.ok) {
      return {
        ok: false,
        error: result.status !== undefined ? `HTTP ${result.status}` : result.error.message,
      };
    }

    return { ok: true, data: result.data.data ?? [], };
  } catch (error) {
    return { ok: false, error: (error as Error).message, };
  }
}

/** Construction options for {@link ChatPicker}. */
export interface ChatPickerOptions {
  /** Bearer token for the chats call; omit to run anonymous. */
  sessionToken?: string;
  /** Invoked with the selected chat's id. */
  onSelect: (chatId: string,) => void;
  /** Invoked after the overlay hides. */
  onHide?: () => void;
  /** Repaint hook; the shell routes this to the pi-tui renderer. */
  onRequestRender?: () => void;
  /** Terminal row count source (the shell passes `tui.terminal.rows`). */
  getViewportRows?: () => number;
}

/** */
export class ChatPicker implements Component, Focusable {
  focused = false;
  private chats: ChatSummary[] = [];
  private rows: string[] = [];
  /** Rendered in place of the list when loading failed. */
  private failure: string | null = null;
  private visibleFlag = false;
  private creating = false;
  private prompt: ChatInputField | null = null;
  /** Name committed from the prompt while the template step is open. */
  private pendingName: string | null = null;
  /** Setup templates for the create flow; [] degrades to plain creation. */
  private templates: ChatPickerTemplate[] = [];
  private templateRows: string[] = [];
  private sessionToken: string | undefined;
  private footer = "Enter: bind chat | Esc: close";
  private readonly menu: MenuList;
  private readonly templateMenu: MenuList;
  private readonly onSelect: (chatId: string,) => void;
  private readonly onHide: (() => void) | undefined;
  private readonly requestRender: () => void;
  private readonly getViewportRows: () => number;

  /**
   * @param options - session token, selection callback, repaint hooks
   */
  constructor(options: ChatPickerOptions,) {
    this.sessionToken = options.sessionToken === "" ? undefined : options.sessionToken;
    this.onSelect = options.onSelect;
    this.onHide = options.onHide;
    this.requestRender = options.onRequestRender ?? ((): void => {
      /* no host wired: tests read render() directly */
    });

    this.getViewportRows = options.getViewportRows ?? ((): number => 24);
    this.menu = new MenuList({
      rows: () => this.rows,
      onSelect: (index,) => {
        const chat = this.chats[index];
        if (chat) { this.onSelect(chat.id,); }
      },
      vi: true,
    },);

    this.templateMenu = new MenuList({
      rows: () => this.templateRows,
      onSelect: (index,) => {
        const template = this.templates[index];
        const name = this.pendingName;
        this.pendingName = null;
        if (name !== null) { void this.commitCreate(name, template?.id,); }
      },
      vi: true,
    },);
  }

  /** @param width */
  render(width: number,): readonly string[] {
    const viewport = Math.max(8, this.getViewportRows(),);
    const bodyHeight = Math.max(1, viewport - 3,); // top/bottom border + footer
    const templateOpen = this.pendingName !== null;
    this.menu.setHeight(bodyHeight - (this.prompt ? 2 : 0),);
    this.templateMenu.setHeight(Math.max(1, bodyHeight - 2,),);

    const body: string[] = [];
    if (templateOpen) {
      body.push("Select a template:", "", ...this.templateMenu.render(width - 2,),);
    } else if (this.failure) {
      body.push(`{red-fg}${this.failure}{/red-fg}`,);
    } else if (this.rows.length === 0) {
      body.push(this.footer === NO_CHATS_MESSAGE ? NO_CHATS_MESSAGE : "",);
    } else {
      body.push(...this.menu.render(width - 2,),);
    }

    if (this.prompt) {
      body.push("", ...this.prompt.render(width - 2,),);
    }

    while (body.length < bodyHeight) { body.push("",); }

    const framed = renderFramed({ title: "Chats", rows: body, width, color: "magenta", },);
    return [...framed, ` ${tagsToAnsi(this.footer,)}`,];
  }

  /**
   * While the create prompt is open every key except the shell's toggles
   * belongs to the prompt (Esc cancels it without closing the overlay).
   * Without a prompt the shell's global chain owns Esc/q/Tab and everything
   * else lands in `handleInput`.
   * @param data - raw key data from pi-tui
   * @returns whether this overlay claims the key
   */
  capturesInput(data: string,): boolean {
    if (!this.visibleFlag || (!this.prompt && this.pendingName === null)) { return false; }
    return !isShellKey(data,);
  }

  /** @param data - raw key data from pi-tui */
  handleInput(data: string,): void {
    if (!this.visibleFlag) { return; }

    const pendingName = this.pendingName;
    if (pendingName !== null) {
      if (matchesKey(data, "escape",)) {
        this.pendingName = null;
        void this.commitCreate(pendingName,);
        return;
      }

      this.templateMenu.handleInput(data,);
      this.requestRender();
      return;
    }

    const prompt = this.prompt;
    if (prompt) {
      if (matchesKey(data, "escape",)) {
        this.cancelCreate();
        return;
      }

      if (matchesKey(data, "enter",)) {
        const value = prompt.getValue();
        this.prompt = null;
        this.enterTemplateStep(value,);
        return;
      }

      prompt.handleInput(data,);
      this.requestRender();
      return;
    }

    if (data === "c") {
      this.startCreate();
      return;
    }

    this.menu.handleInput(data,);
    this.requestRender();
  }

  /** Show the overlay and load the chat list. */
  show(): void {
    this.visibleFlag = true;
    this.requestRender();
    void this.refresh();
    void this.loadTemplates().then(() => this.requestRender());
  }

  /** Hide the overlay without touching the bound chat. */
  hide(): void {
    this.visibleFlag = false;
    this.pendingName = null;
    this.cancelCreate();
    this.requestRender();
    this.onHide?.();
  }

  /**
   * Close the picker if it is open. The app calls this from its global
   * Esc/q/Ctrl-C handler so an open overlay swallows the key instead of
   * quitting the process.
   * @returns true when the picker was visible and has now been hidden
   */
  dismiss(): boolean {
    if (!this.visibleFlag) { return false; }
    this.hide();
    return true;
  }

  /**
   * Fetch the setup templates for the create flow. Failure degrades to
   * plain name-only creation, never blocking the prompt.
   */
  private async loadTemplates(): Promise<void> {
    try {
      const result = await _fetch<ChatPickerTemplate[]>(`${API_BASE}/api/v1/chat-setup-templates`, {
        auth: this.sessionToken ? { sessionToken: this.sessionToken, } : undefined,
        handle401: false,
      },);

      if (!result.ok) { return; }
      this.templates = Array.isArray(result.data,) ? result.data : [];
      this.templateRows = this.templates.map((template,) => escapeMarkup(template.name,) || "(unnamed)");
      this.templateMenu.resetCursor();
    } catch {
      /* ignore — creation still works without templates */
    }
  }

  /**
   * Move to the template step after the name prompt commits. Commits
   * plainly when templates never loaded; blank names stay local.
   * @param rawName - the committed name from the prompt
   */
  private enterTemplateStep(rawName: string,): void {
    if (rawName.trim() === "") {
      this.footer = this.chats.length > 0
        ? `${this.chats.length} chat(s) | Enter: bind chat | Esc: close`
        : NO_CHATS_MESSAGE;

      this.requestRender();

      return;
    }

    if (this.templates.length === 0) {
      void this.commitCreate(rawName,);

      return;
    }

    this.pendingName = rawName.trim();
    this.footer = CREATE_TEMPLATE_STATUS;
    this.requestRender();
  }

  /**
   * Open the new-chat prompt: an input row rendered inside the overlay.
   * Enter commits, Esc cancels (see {@link capturesInput}).
   */
  startCreate(): void {
    if (this.creating) { return; }
    if (!this.prompt) {
      this.prompt = new ChatInputField();
    }

    this.prompt.setValue("",);
    this.footer = CREATE_STATUS;
    this.requestRender();
  }

  /**
   * Drop the prompt.
   *
   * `creating` is deliberately left alone: a commit already in flight must finish
   * on its own answer, which is what re-arms the status line and re-enables `c`.
   */
  cancelCreate(): void {
    if (!this.prompt) { return; }
    this.prompt = null;
    this.footer = this.chats.length > 0
      ? `${this.chats.length} chat(s) | Enter: bind chat | Esc: close`
      : NO_CHATS_MESSAGE;

    this.requestRender();
  }

  /**
   * POST the name and bind the new chat.
   *
   * The name is the server's `Name` primitive (src/validation/schemas/chat.ts:32)
   * — 1-255 chars — so a blank line is rejected locally rather than round-tripped
   * into a 400 the user cannot act on.
   * @param name - the typed chat name
   * @param templateId - setup template id; omit for a blank chat
   * @throws never — failures land on the footer
   */
  async commitCreate(name: string, templateId?: string,): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      this.cancelCreate();
      return;
    }

    // One commit at a time: a second Enter while the first is in flight would
    // otherwise create two chats and bind whichever answer landed last.
    if (this.creating) { return; }

    this.creating = true;
    this.prompt = null;
    this.footer = CREATING_STATUS;
    this.requestRender();

    try {
      const result = await _createChat({ name: trimmed, templateId, sessionToken: this.sessionToken, },);

      if (!result.ok) {
        // The prompt is gone by now, so the error lands on the footer — the
        // same place a load failure renders — and `c` still works to retry.
        this.footer = result.error;
        this.requestRender();
        return;
      }

      this.onSelect(result.chatId,);
    } finally {
      this.creating = false;
    }
  }

  /**
   * @returns whether the new-chat prompt is open
   */
  isPromptOpen(): boolean {
    return this.prompt !== null;
  }

  /**
   * @returns whether the template step is open
   */
  isTemplateStepOpen(): boolean {
    return this.pendingName !== null;
  }

  /**
   * @returns whether a create commit is in flight
   */
  isCreating(): boolean {
    return this.creating;
  }

  /**
   * @returns whether the overlay is currently shown
   */
  isVisible(): boolean {
    return this.visibleFlag;
  }

  /**
   * Reload chats from the API and re-render the list. Never clears a
   * create flow already in progress.
   */
  async refresh(): Promise<void> {
    const result = await loadChats(this.sessionToken,);

    if (!result.ok) {
      this.chats = [];
      this.rows = [];
      this.failure = `Failed to load chats: ${result.error}`;
      if (this.pendingName === null && this.prompt === null && !this.creating) {
        this.footer = "Esc: close";
      }

      this.requestRender();

      return;
    }

    this.failure = null;
    this.chats = result.data;
    if (this.chats.length === 0) {
      this.rows = [];
      if (this.pendingName === null && this.prompt === null && !this.creating) {
        this.footer = NO_CHATS_MESSAGE;
      }
    } else {
      this.rows = this.chats.map((chat,) =>
        `${pinnedTag(chat.is_pinned,)}${escapeMarkup(chat.name,) || "(unnamed)"}  {gray}(${
          chat.id.slice(0, 8,)
        }…){/gray}`
      );

      if (this.pendingName === null && this.prompt === null && !this.creating) {
        this.footer = `${this.chats.length} chat(s) | Enter: bind chat | Esc: close`;
      }
    }

    this.requestRender();
  }
}

/** True for keys the shell owns even while an overlay is focused. */
function isShellKey(data: string,): boolean {
  return SHELL_F_KEYS.some((key,) => matchesKey(data, key,)) ||
    matchesKey(data, "ctrl+c",);
}
