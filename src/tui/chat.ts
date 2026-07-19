/**
 * TUI Chat Widget
 *
 * Blessed-based chat interface with message list, input box,
 * and API wiring to send/receive messages from the backend.
 * Designed to be embedded in TUIApp.screen.
 */

import blessed from "blessed";
import { safeJsonStringify, } from "../utils";

export const API_BASE = process.env.LOOP_LORE_API_BASE_URL ?? "http://localhost:3000";

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  actorName?: string;
}

export interface ChatWidgetOptions {
  sessionToken?: string;
  onChatChange?: (chatId: string,) => void;
}

export class ChatWidget {
  private screen: blessed.Widgets.Screen;
  private box: blessed.Widgets.BoxElement;
  private messageList: blessed.Widgets.ListElement;
  private inputBox: blessed.Widgets.TextboxElement;
  private chatId: string | null = null;
  private messages: ChatMessage[] = [];
  private itemCount = 0;
  private isSending = false;
  private sessionToken: string | undefined;
  private onChatChange?: (chatId: string,) => void;
  private cursor: string | null = null; // pagination cursor

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

  setSessionToken(token: string,): void {
    this.sessionToken = token;
  }

  // ── Chat selection ──────────────────────────────────────────

  setChatId(chatId: string,): void {
    this.chatId = chatId;
    this.cursor = null;
    this.clearMessages();
    this.onChatChange?.(chatId,);
  }

  getChatId(): string | null {
    return this.chatId;
  }

  // ── Message display ─────────────────────────────────────────

  addMessage(message: ChatMessage,): void {
    this.messages.push(message,);
    /* eslint-disable unicorn/no-incorrect-template-string-interpolation */
    const prefix = message.actorName
      ? `{bold}${message.actorName}{/bold}: `
      : `{bold}${message.role}{/bold}: `;
    /* eslint-enable unicorn/no-incorrect-template-string-interpolation */
    const display = `${prefix}${message.content.slice(0, 200,)}${message.content.length > 200 ? "..." : ""}`;
    this.messageList.addItem(display,);
    this.itemCount++;
    this.scrollToBottom();
  }

  setMessages(messages: ChatMessage[],): void {
    this.messages = messages;
    const items = messages.map((msg,) => {
      /* eslint-disable unicorn/no-incorrect-template-string-interpolation */
      const prefix = msg.actorName ? `{bold}${msg.actorName}{/bold}: ` : `{bold}${msg.role}{/bold}: `;
      /* eslint-enable unicorn/no-incorrect-template-string-interpolation */
      return `${prefix}${msg.content.slice(0, 200,)}${msg.content.length > 200 ? "..." : ""}`;
    },);
    this.messageList.setItems(items,);
    this.itemCount = items.length;
    this.scrollToBottom();
  }

  clearMessages(): void {
    this.messages = [];
    this.itemCount = 0;
    this.messageList.clearItems();
  }

  scrollToBottom(): void {
    if (this.itemCount > 0) {
      this.messageList.select(this.itemCount - 1,);
    }
    this.screen.render();
  }

  showTyping(): void {
    this.messageList.addItem("{italic}{yellow}... typing{/yellow}{/italic}",);
    this.itemCount++;
    this.scrollToBottom();
  }

  hideTyping(): void {
    if (this.itemCount > 0) {
      this.messageList.popItem();
      this.itemCount--;
    }
    this.screen.render();
  }

  showError(message: string,): void {
    this.messageList.addItem(`{red-fg}⚠ Error: ${message}{/red-fg}`,);
    this.scrollToBottom();
  }

  // ── API wiring ─────────────────────────────────────────────────

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json", };
    if (this.sessionToken) {
      headers.Authorization = `Bearer ${this.sessionToken}`;
    }
    return headers;
  }

  /**
   * Send message via POST /api/chats/:id/messages.
   * Shows typing indicator, adds user message + assistant auto-reply.
   */
  async handleSend(text: string,): Promise<void> {
    if (!this.chatId) {
      this.showError("No active chat. Create or select a chat first.",);
      return;
    }
    if (this.isSending) { return; }

    this.isSending = true;
    this.showTyping();

    try {
      const bodyResult = safeJsonStringify({ content: text, role: "user", },);
      const res = await fetch(`${API_BASE}/api/chats/${this.chatId}/messages`, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: bodyResult.ok ? bodyResult.value : "{}",
      },);

      this.hideTyping();

      if (!res.ok) {
        let body: { error?: string };
        try {
          body = (await res.json()) as { error?: string };
        } catch {
          body = { error: res.statusText, };
        }
        this.showError(body.error ?? `HTTP ${res.status}`,);
        return;
      }

      const data = (await res.json()) as {
        id: string;
        assistantMessage?: { id: string; content: string };
      };

      // Add user message
      this.addMessage({ id: data.id, role: "user", content: text, },);

      // Add assistant auto-reply if present
      if (data.assistantMessage) {
        this.addMessage({
          id: data.assistantMessage.id,
          role: "assistant",
          content: data.assistantMessage.content,
        },);
      }
    } catch (error) {
      this.hideTyping();
      this.showError(`Network error: ${(error as Error).message}`,);
    } finally {
      this.isSending = false;
      this.screen.render();
    }
  }

  /** Load messages from GET /api/chats/:id/messages with cursor-based pagination */
  async loadMessages(): Promise<void> {
    if (!this.chatId) { return; }
    try {
      const url = this.cursor
        ? `${API_BASE}/api/chats/${this.chatId}/messages?pageSize=200&cursor=${this.cursor}`
        : `${API_BASE}/api/chats/${this.chatId}/messages?pageSize=200`;
      const res = await fetch(url, { headers: this.getAuthHeaders(), },);
      if (!res.ok) {
        this.showError(`Failed to load messages (HTTP ${res.status})`,);
        return;
      }
      const data = (await res.json()) as { data: ChatMessage[]; cursor: string | null };
      this.cursor = data.cursor ?? this.cursor;
      // Prepend older messages (cursor fetches older)
      this.messages = this.messages.length > 0 ? [...data.data, ...this.messages,] : data.data;
      this.itemCount = this.messages.length;
      this.scrollToBottom();
    } catch (error) {
      this.showError(`Network error loading messages: ${(error as Error).message}`,);
    }
  }
}
