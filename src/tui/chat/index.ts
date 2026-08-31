// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
import { handleSend as handleSendDispatch, loadMessages as loadMessagesDispatch, } from "./api";
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
  chatId: string | null = null;
  messages: ChatMessage[] = [];
  itemCount = 0;
  isSending = false;
  sessionToken: string | undefined;
  private onChatChange?: (chatId: string,) => void;
  cursor: string | null = null; // pagination cursor

  /**
   * @param screen
   * @param options
   */
  constructor(screen: blessed.Widgets.Screen, options: ChatWidgetOptions = {},) {
    this.screen = screen;
    this.sessionToken = options.sessionToken;
    this.onChatChange = options.onChatChange;

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
      inputOnFocus: true,
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

    // Focus input on startup
    this.inputBox.focus();

    // Send message on Enter
    this.inputBox.on("submit", (value: string,) => {
      if (value.trim() && !this.isSending) {
        void this.handleSend(value.trim(),);
      }
      // Clear after handleSend completes (avoid race)
      this.inputBox.clearValue();
      this.inputBox.focus();
      screen.render();
    },);

    // Focus management
    screen.key(["tab",], () => {
      if (screen.focused === this.inputBox) {
        this.messageList.focus();
      } else {
        this.inputBox.focus();
      }
      screen.render();
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
    this.cursor = null;
    this.clearMessages();
    this.onChatChange?.(chatId,);
  }

  /** */
  getChatId(): string | null {
    return this.chatId;
  }

  // ── Message display ─────────────────────────────────────────

  /**
   * @param message
   */
  addMessage(message: ChatMessage,): void {
    this.messages.push(message,);
    this.messageList.addItem(formatMessageLine(message,),);
    this.itemCount++;
    this.scrollToBottom();
  }

  /**
   * @param messages
   */
  setMessages(messages: ChatMessage[],): void {
    this.messages = messages;
    const items = Array.from(messages, (msg,) => formatMessageLine(msg,),);
    this.messageList.setItems(items,);
    this.itemCount = items.length;
    this.scrollToBottom();
  }

  /** */
  clearMessages(): void {
    this.messages = [];
    this.itemCount = 0;
    this.messageList.clearItems();
  }

  /** */
  scrollToBottom(): void {
    if (this.itemCount > 0) {
      this.messageList.select(this.itemCount - 1,);
    }
    this.screen.render();
  }

  /** */
  showTyping(): void {
    this.messageList.addItem("{italic}{yellow}... typing{/yellow}{/italic}",);
    this.itemCount++;
    this.scrollToBottom();
  }

  /** */
  hideTyping(): void {
    if (this.itemCount > 0) {
      this.messageList.popItem();
      this.itemCount--;
    }
    this.screen.render();
  }

  /**
   * @param message
   */
  showError(message: string,): void {
    this.messageList.addItem(`{red-fg}⚠ Error: ${message}{/red-fg}`,);
    this.scrollToBottom();
  }

  // ── API wiring ─────────────────────────────────────────────────

  /**
   * Send message via POST /api/chats/:id/messages.
   * Shows typing indicator, adds user message + assistant auto-reply.
   * @param text
   */
  async handleSend(text: string,): Promise<void> {
    return handleSendDispatch(this, text,);
  }

  /** Load messages from GET /api/chats/:id/messages with cursor-based pagination */
  async loadMessages(): Promise<void> {
    return loadMessagesDispatch(this,);
  }
}
