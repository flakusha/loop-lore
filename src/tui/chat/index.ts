// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 340
/**
 * TUI Chat Widget
 *
 * Blessed-based chat interface with message list, input box,
 * and API wiring to send/receive messages from the backend.
 * Designed to be embedded in TUIApp.screen.
 *
 * The API wiring (send / load / auth headers) and the message line formatting
 * live in sibling dispatcher modules (api / display) threaded with an explicit
 * `ChatHost` handle. `ChatWidget` remains a class so it can be `new`-ed by the
 * TUI app and holds the blessed element references.
 */
import blessed from "blessed";
import { TUI_DEFAULTS, } from "../../config/sections/tui";
import { escapeMarkup, } from "../markup";
import {
  generateImage as generateImageDispatch,
  handleSend as handleSendDispatch,
  loadCommands,
  loadMessages as loadMessagesDispatch,
  uploadAsset as uploadAssetDispatch,
} from "./api";
import type { ImageGenResult, MessageAttachment, UploadResult, } from "./api";
import { CommandCompleter, } from "./commands";
import { formatMessageLine, } from "./display";
import type { ChatHost, ChatMessage, ChatWidgetOptions, } from "./types";

export { API_BASE, } from "./api";
export type { ChatMessage, ChatWidgetOptions, } from "./types";

/** */
export class ChatWidget implements ChatHost {
  screen: blessed.Widgets.Screen;
  private box: blessed.Widgets.BoxElement;
  messageList: blessed.Widgets.ListElement;
  private inputBox: blessed.Widgets.TextboxElement;
  private completionStrip: blessed.Widgets.TextElement;
  private completer: CommandCompleter;
  chatId: string | null = null;
  messages: ChatMessage[] = [];
  /** Rows currently in the list. Owned by the widget alone: every append and
   * removal below moves it with the list, so `scrollToBottom`'s `select()` can
   * never point at a row the list does not have. */
  itemCount = 0;
  /** Row the typing placeholder occupies, or null when none is showing.
   * `hideTyping` removes THIS row, not the tail — after a load or an error line
   * the tail is a real message, and popping it lost one per send. */
  private typingRow: number | null = null;
  isSending = false;
  sessionToken: string | undefined;
  sendTimeoutMs: number;
  private onChatChange?: (chatId: string,) => void;
  private onAssetsRefresh: () => void;
  private linkAsset?: (assetId: string,) => Promise<boolean>;
  private isOverlayOpen: () => boolean;

  /**
   * @param screen
   * @param options
   */
  constructor(screen: blessed.Widgets.Screen, options: ChatWidgetOptions = {},) {
    this.screen = screen;
    // Normalize empty string to undefined (mirrors the frontend `if (token)`
    // pattern in src/frontend/fe-fetch.ts:41): an accidental `""` must not
    // ship as `Bearer ` and trip 401s.
    this.sessionToken = options.sessionToken === "" ? undefined : options.sessionToken;
    this.sendTimeoutMs = options.sendTimeoutMs ?? TUI_DEFAULTS.sendTimeoutMs;
    this.onChatChange = options.onChatChange;
    this.onAssetsRefresh = options.onAssetsRefresh ?? ((): void => {
      /* no sidebar wired: refresh is a host responsibility */
    });

    this.linkAsset = options.linkAsset;
    this.isOverlayOpen = options.isOverlayOpen ?? (() => false);
    // Main container box
    this.box = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
    },);

    // Message list (top portion)
    this.messageList = blessed.list({
      parent: this.box,
      top: 0,
      left: 0,
      width: "100%",
      height: "90%-1",
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: " ",
        track: { bg: "blue", },
        style: { bg: "cyan", },
      },
      style: {
        item: { fg: "white", },
        selected: { fg: "white", bg: "blue", },
      },
      mouse: true,
    },);

    // Input box (bottom)
    this.inputBox = blessed.textbox({
      parent: this.box,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 3,
      // inputOnFocus is deliberately OFF. It makes blessed call readInput() on
      // focus, which sets `screen.grabKeys = true` and gates EVERY screen-level
      // keypress (widgets/screen.js:591) for as long as the box holds focus —
      // and `_done` re-arms via `screen.rewindFocus()`, so no overlay could take
      // focus away from it either. Reading is armed explicitly by `focusInput()`
      // instead; `releaseInput()` is the other half of that pair.
      inputOnFocus: false,
      style: {
        bg: "black",
        fg: "white",
        focus: { bg: "blue", },
      },
      border: {
        type: "line",
        fg: 6, // cyan
      },
    },);

    // Slash-command completion. The chat box already owns the layout, so the
    // hint is one line above the input rather than a second screen - the
    // epic bans a palette overlay.
    this.completionStrip = blessed.text({
      parent: this.box,
      bottom: 3,
      left: 0,
      width: "100%",
      height: 1,
      tags: true,
      content: "",
      style: {
        fg: "cyan",
      },
    },);

    this.completer = new CommandCompleter({
      loadRegistry: () => loadCommands(this.sessionToken, this.chatId,),
      onChange: () => {
        this.completionStrip.setContent(this.completer.hint() ?? "",);
        this.screen.render();
      },
    },);

    // Focus the input on startup and start reading keystrokes into it. Both
    // halves are explicit — see `focusInput` for why `inputOnFocus` is unusable.
    this.focusInput();

    // Re-filter as the user types. Textarea attaches its own keypress listener
    // in a nextTick after focus, so ours - registered here - runs first and
    // would still see the previous value; a microtask runs once the emit has
    // settled and the textbox has applied the keystroke.
    this.inputBox.on("keypress", () => {
      queueMicrotask(() => {
        this.completer.update(this.inputBox.getValue(),);
      },);
    },);

    // Send message on Enter, or commit the highlighted completion.
    this.inputBox.on("submit", (value: string,) => {
      const committed = this.completer.accept();
      if (committed !== null) {
        this.inputBox.setValue(committed,);
        this.focusInput();
        screen.render();
        return;
      }

      const trimmed = value.trim();
      // Client-side image-gen and upload: the TUI cannot rely on the web
      // frontend's command-action dispatch, so `/image` and `/upload` are
      // handled here. Anything else goes through the normal send path (the
      // server still dispatches its own `/image` command for other clients).
      if (trimmed.startsWith("/image ",)) {
        this.inputBox.clearValue();
        void this.generateImageFlow(trimmed.slice("/image ".length,),);
        this.focusInput();
        screen.render();
        return;
      }

      if (trimmed.startsWith("/upload ",)) {
        this.inputBox.clearValue();
        void this.uploadFlow(trimmed.slice("/upload ".length,),);
        this.focusInput();
        screen.render();
        return;
      }

      if (trimmed && !this.isSending) {
        void this.handleSend(trimmed,);
        // Clear only what was actually dispatched. A send already in flight can
        // run for minutes, and clearing here threw away whatever the user typed
        // while waiting for it.
        this.inputBox.clearValue();
      }

      this.focusInput();
      screen.render();
    },);

    // Focus management. A live completion owns Tab while one is on offer;
    // with nothing to complete Tab keeps its input <-> list switch.
    screen.key(["tab",], () => {
      // An overlay on top owns the keyboard. Acting here would pull focus
      // into a hidden input box underneath it.
      if (this.isOverlayOpen()) { return; }
      if (this.completer.cycle()) {
        screen.render();
        return;
      }

      if (screen.focused === this.inputBox) {
        // Release first: a box still reading holds `screen.grabKeys`, which
        // gates screen-level keys and would leave the list unreachable.
        this.releaseInput();
        this.messageList.focus();
      } else {
        this.focusInput();
      }

      screen.render();
    },);
  }

  /**
   * Point the keyboard at the input box and start reading keystrokes into it.
   *
   * Both halves matter. `focus()` alone leaves the box visible but deaf —
   * `readInput()` is what installs the keypress listener and sets
   * `screen.grabKeys`. `readInput()` returns early when already reading, so
   * this is safe to call on every path that wants the box live.
   */
  focusInput(): void {
    // Guard the focus call. `focus()` on an already-focused element still emits
    // `blur`, which runs blessed's `_done` and tears down the read — including
    // the one `readInput()` scheduled but has not attached yet, orphaning it and
    // making the NEXT `readInput()` stack a second listener (every keystroke
    // then applied twice). `readInput()` already no-ops while reading.
    if (this.screen.focused !== this.inputBox) {
      this.inputBox.focus();
    }

    this.inputBox.readInput();
  }

  /**
   * Hand the keyboard back so another widget can own it.
   *
   * `emit("blur")` is the event blessed's own Textarea listens for to tear
   * down a read (widgets/textarea.js:206), so it clears the listener and drops
   * `screen.grabKeys` without the `rewindFocus()` bounce that made overlays
   * impossible to focus. Paired with {@link focusInput}.
   */
  releaseInput(): void {
    // Deferred on purpose. blessed installs the read listener in a nextTick
    // AFTER `readInput()` returns (widgets/textarea.js:200), and `_done` only
    // removes the listener it can see. Emitting blur synchronously inside that
    // window leaves the pending attach orphaned, so the next `focusInput()`
    // stacks a second listener and every keystroke is applied twice. Yielding a
    // tick puts the attach first and the teardown second, which is the order
    // `_done` expects.
    setImmediate(() => {
      this.inputBox.emit("blur",);
    },);
  }

  /**
   * @param token
   */
  setSessionToken(token: string,): void {
    this.sessionToken = token;
  }

  // ── Chat selection ──────────────────────────────────────────

  /**
   * @param chatId
   */
  setChatId(chatId: string,): void {
    this.chatId = chatId;
    this.typingRow = null;
    this.clearMessages();
    this.onChatChange?.(chatId,);
  }

  /**
   * @returns currently-scoped chat id, or `null` when none.
   */
  getChatId(): string | null {
    return this.chatId;
  }

  // ── Message display ─────────────────────────────────────────

  /**
   * @param message - chat message to append to the list
   */
  addMessage(message: ChatMessage,): void {
    this.messages.push(message,);
    this.messageList.addItem(formatMessageLine(message,),);
    this.itemCount++;
    this.scrollToBottom();
  }

  /**
   * Replace the rendered transcript with `messages` and scroll to its last row.
   * @param messages - the page `loadMessages` read, or an empty list
   */
  setMessages(messages: ChatMessage[],): void {
    this.messages = messages;
    // A fresh transcript has no typing placeholder: whatever row one held is
    // gone with the old items.
    this.typingRow = null;
    const items = Array.from(messages, (msg,) => formatMessageLine(msg,),);
    this.messageList.setItems(items,);
    this.itemCount = items.length;
    this.scrollToBottom();
  }

  /** Clear the message list and item counter. */
  clearMessages(): void {
    this.messages = [];
    this.itemCount = 0;
    this.typingRow = null;
    this.messageList.clearItems();
  }

  /** Scroll the message list to the last item and re-render the screen. */
  scrollToBottom(): void {
    if (this.itemCount > 0) {
      this.messageList.select(this.itemCount - 1,);
    }

    this.screen.render();
  }

  /** Append a "…typing" placeholder and re-render. */
  showTyping(): void {
    if (this.typingRow !== null) { return; }
    this.typingRow = this.itemCount;
    this.messageList.addItem("{italic}{yellow}... typing{/yellow}{/italic}",);
    this.itemCount++;
    this.scrollToBottom();
  }

  /** Remove the "…typing" placeholder if present, then re-render. */
  hideTyping(): void {
    const row = this.typingRow;
    if (row === null) { return; }

    this.typingRow = null;
    this.messageList.removeItem(row,);
    this.itemCount--;
    this.scrollToBottom();
  }

  /**
   * @param message - error text to append in red
   */
  showError(message: string,): void {
    this.messageList.addItem(`{red-fg}⚠ Error: ${escapeMarkup(message,)}{/red-fg}`,);
    // itemCount tracks the list length for scrollToBottom's select().
    // Omitting it here desynced the two, so the error line was the one
    // line that could never be selected.
    this.itemCount++;
    this.scrollToBottom();
  }

  // ── API wiring ─────────────────────────────────────────────────

  /**
   * Send message via POST /api/chats/:id/messages.
   * Shows typing indicator, adds user message + assistant auto-reply.
   * @param text - user message body
   * @param attachments - optional asset ids the sent message carries
   * @returns resolves after dispatching to the API and updating local state.
   */
  async handleSend(text: string, attachments?: MessageAttachment[],): Promise<void> {
    return handleSendDispatch(this, text, attachments,);
  }

  /**
   * Generate an image from a prompt and report the result in-transcript.
   *
   * The server links the output to the active chat, so the F2 sidebar shows
   * it on its next load — no follow-up action needed to keep the asset.
   * @param prompt - the image prompt
   * @returns the generation result
   */
  async generateImage(prompt: string,): Promise<ImageGenResult> {
    return generateImageDispatch(this, prompt,);
  }

  /**
   * Upload a local file as an asset and report the result in-transcript.
   * @param filePath - local path to upload
   * @returns the upload result
   */
  async uploadAsset(filePath: string,): Promise<UploadResult> {
    return uploadAssetDispatch(this, filePath,);
  }

  /**
   * Link a freshly uploaded asset to the active chat.
   * @param assetId - the uploaded asset's id
   * @returns `true` when the link was created
   */
  private async linkUploadedAsset(assetId: string,): Promise<boolean> {
    // Absent when the widget is built bare (unit tests, or a host without
    // a sidebar) — the caller reports the id and skips the link step.
    if (this.linkAsset == null) { return false; }
    return this.linkAsset(assetId,);
  }

  /**
   * `/image` submit flow: generate, then report the asset in-transcript.
   * @param prompt - the image prompt
   */
  private async generateImageFlow(prompt: string,): Promise<void> {
    this.showTyping();
    try {
      const result = await this.generateImage(prompt,);
      this.hideTyping();
      if (!result.ok) {
        this.showError(result.error,);
        return;
      }

      // The server linked the output to the chat on persist — pull it into
      // the sidebar now so the asset is actually there, not just promised.
      this.onAssetsRefresh();
      const names = result.assets.map((a,) => a.filename).join(", ",);
      this.addMessage({
        id: crypto.randomUUID(),
        role: "system",
        content: `Image ready: ${names || "(no assets returned)"} — Enter in the F2 assets sidebar attaches it.`,
      },);
    } catch (error) {
      this.hideTyping();
      this.showError(`Network error: ${(error as Error).message}`,);
    }
  }

  /**
   * `/upload` submit flow: upload, link to the chat, report in-transcript.
   * @param filePath - local path to upload
   */
  private async uploadFlow(filePath: string,): Promise<void> {
    this.showTyping();
    try {
      const result = await this.uploadAsset(filePath,);
      this.hideTyping();
      if (!result.ok) {
        this.showError(result.error,);
        return;
      }

      // Uploads create unlinked assets, invisible to the chat-scoped
      // sidebar. Linking here keeps upload-to-attach one step; failures
      // surface inline and keep the unlinked id recoverable from the
      // transcript line.
      const linked = await this.linkUploadedAsset(result.assetId,);
      this.onAssetsRefresh();
      this.addMessage({
        id: crypto.randomUUID(),
        role: "system",
        content: linked
          ? `Uploaded ${result.assetId} — Enter in the F2 sidebar attaches it to this chat.`
          : `Uploaded ${result.assetId} but linking to this chat failed — attach it from the Web UI.`,
      },);
    } catch (error) {
      this.hideTyping();
      this.showError(`Network error: ${(error as Error).message}`,);
    }
  }

  /**
   * Load the chat's newest page from GET /api/chats/:id/messages into the list.
   * @returns resolves once the list holds that page.
   */
  async loadMessages(): Promise<void> {
    return loadMessagesDispatch(this,);
  }
}
