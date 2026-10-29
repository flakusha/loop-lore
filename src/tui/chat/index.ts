// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 360
/**
 * TUI Chat Widget (pi-tui)
 *
 * Message transcript (follow-tail ScrollView), slash-command completion strip
 * and a single-line input framed at the bottom. The API wiring (send / load /
 * auth headers) and the message line formatting live in sibling dispatcher
 * modules (api / display) threaded with an explicit `ChatHost` handle.
 *
 * Focus is delegated: the widget owns two focus targets (`input`,
 * `transcript`) and asks the host to move the keyboard between them through
 * `options.onFocusRequest`; Tab cycling lives in `handleTab`, invoked by the
 * shell's global key router.
 */
import { TUI_DEFAULTS, } from "../../config/sections/tui";
import { tagsToAnsi, } from "../ansi";
import { renderFramed, } from "../frame";
import { escapeMarkup, } from "../markup";
import { type Component, truncateToWidth, } from "../pi";
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
import { ChatInputField, } from "./input-field";
import { TranscriptPane, } from "./transcript";
import type { ChatHost, ChatMessage, ChatWidgetOptions, } from "./types";

export { API_BASE, } from "./api";
export type { ChatMessage, ChatWidgetOptions, } from "./types";

/** Typing placeholder row, in blessed-tag form like every other row. */
const TYPING_ROW = "{italic}{yellow}... typing{/yellow}{/italic}";

/** */
export class ChatWidget implements Component, ChatHost {
  readonly input: ChatInputField = new ChatInputField();
  readonly transcript: TranscriptPane = new TranscriptPane();
  /** Rows currently in the transcript (blessed-tagged, pre-ANSI conversion). */
  transcriptLines: string[] = [];
  chatId: string | null = null;
  messages: ChatMessage[] = [];
  /** Row the typing placeholder occupies, or null when none is showing.
   * `hideTyping` removes THIS row, not the tail — after a load or an error line
   * the tail is a real message, and popping it lost one per send. */
  private typingRow: number | null = null;
  isSending = false;
  sessionToken: string | undefined;
  sendTimeoutMs: number;
  private completer: CommandCompleter;
  private completionHint = "";
  private focus: "input" | "transcript" = "input";
  private readonly onFocusRequest?: (target: Component,) => void;
  private readonly requestRenderHook: () => void;
  /** Total rows the widget may occupy; the shell updates it on resize. */
  private bodyHeight = 20;
  private onChatChange?: (chatId: string,) => void;
  private onAssetsRefresh: () => void;
  private linkAsset?: (assetId: string,) => Promise<boolean>;

  /** @returns row count of the transcript, placeholder included. */
  get itemCount(): number {
    return this.transcriptLines.length;
  }

  /** */
  constructor(options: ChatWidgetOptions = {},) {
    // Normalize empty string to undefined (mirrors the frontend `if (token)`
    // pattern in src/frontend/fe-fetch.ts:41): an accidental `""` must not
    // ship as `Bearer ` and trip 401s.
    this.sessionToken = options.sessionToken === "" ? undefined : options.sessionToken;
    this.sendTimeoutMs = options.sendTimeoutMs ?? TUI_DEFAULTS.sendTimeoutMs;
    this.onChatChange = options.onChatChange;
    this.onFocusRequest = options.onFocusRequest;
    this.requestRenderHook = options.onRequestRender ?? ((): void => {
      /* no host wired: tests drive render() directly */
    });

    this.onAssetsRefresh = options.onAssetsRefresh ?? ((): void => {
      /* no sidebar wired: refresh is a host responsibility */
    });

    this.linkAsset = options.linkAsset;

    this.completer = new CommandCompleter({
      loadRegistry: () => loadCommands(this.sessionToken, this.chatId,),
      onChange: () => {
        this.completionHint = this.completer.hint() ?? "";
        this.requestRender();
      },
    },);

    // Re-filter as the user types; the field calls back after every applied
    // keystroke (see ChatInputField).
    this.input.onChange = () => {
      this.completer.update(this.input.getValue(),);
    };

    this.input.onSubmit = (value: string,) => {
      this.handleSubmit(value,);
    };
  }

  // ── Component ───────────────────────────────────────────────

  /** @param width */
  render(width: number,): readonly string[] {
    // Transcript gets everything above the completion strip (1) and the
    // framed input (3).
    const transcriptHeight = Math.max(1, this.bodyHeight - 4,);
    this.transcript.setHeight(transcriptHeight,);
    const strip = this.completionHint
      ? truncateToWidth(tagsToAnsi(`{cyan-fg}${this.completionHint}{/cyan-fg}`,), width,)
      : "";

    const framed = renderFramed({
      title: "",
      rows: this.input.render(Math.max(0, width - 2,),),
      width,
      color: "cyan",
    },);

    return [...this.transcript.render(width,), strip, ...framed,];
  }

  // ── Focus ───────────────────────────────────────────────────

  /** Point the keyboard at the input box. Safe to call repeatedly. */
  focusInput(): void {
    this.focus = "input";
    this.onFocusRequest?.(this.input,);
  }

  /** @returns `true` while the input field owns the keyboard. */
  isInputFocused(): boolean {
    return this.focus === "input";
  }

  /**
   * Tab: a live completion owns it while one is on offer; with nothing to
   * complete Tab keeps its input <-> transcript switch. Routed here by the
   * shell's global key handler.
   */
  handleTab(): void {
    if (this.completer.cycle()) {
      this.requestRender();
      return;
    }

    if (this.focus === "input") {
      this.focus = "transcript";
      this.onFocusRequest?.(this.transcript,);
    } else {
      this.focusInput();
    }
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

  /** Push the current rows into the scroll viewport and repaint. */
  private syncTranscript(): void {
    this.transcript.scroll.setLines(this.transcriptLines.map((line,) => tagsToAnsi(line,)),);
    this.requestRender();
  }

  /**
   * @param message - chat message to append to the transcript
   */
  addMessage(message: ChatMessage,): void {
    this.messages.push(message,);
    this.transcriptLines.push(formatMessageLine(message,),);
    this.scrollToBottom();
  }

  /**
   * Replace the rendered transcript with `messages` and scroll to its last row.
   * @param messages - the page `loadMessages` read, or an empty list
   */
  setMessages(messages: ChatMessage[],): void {
    this.messages = messages;
    // A fresh transcript has no typing placeholder: whatever row one held is
    // gone with the old rows.
    this.typingRow = null;
    this.transcriptLines = Array.from(messages, (msg,) => formatMessageLine(msg,),);
    this.scrollToBottom();
  }

  /** Clear the transcript rows and message list. */
  clearMessages(): void {
    this.messages = [];
    this.typingRow = null;
    this.transcriptLines = [];
    this.syncTranscript();
  }

  /** Scroll the transcript to the last row and re-render. */
  scrollToBottom(): void {
    this.transcript.scroll.scrollToBottom();
    this.syncTranscript();
  }

  /** Append a "…typing" placeholder and re-render. */
  showTyping(): void {
    if (this.typingRow !== null) { return; }
    this.typingRow = this.transcriptLines.length;
    this.transcriptLines.push(TYPING_ROW,);
    this.scrollToBottom();
  }

  /** Remove the "…typing" placeholder if present, then re-render. */
  hideTyping(): void {
    const row = this.typingRow;
    if (row === null) { return; }

    this.typingRow = null;
    this.transcriptLines.splice(row, 1,);
    this.scrollToBottom();
  }

  /**
   * @param message - error text to append in red
   */
  showError(message: string,): void {
    this.transcriptLines.push(`{red-fg}⚠ Error: ${escapeMarkup(message,)}{/red-fg}`,);
    this.scrollToBottom();
  }

  /** @inheritdoc */
  requestRender(): void {
    this.requestRenderHook();
  }

  /**
   * @param height - total rows the shell allocated to the chat column
   */
  setBodyHeight(height: number,): void {
    this.bodyHeight = Math.max(5, height,);
  }

  // ── Submission ──────────────────────────────────────────────

  /**
   * Enter in the input: commit a highlighted completion, dispatch the
   * client-side `/image` and `/upload` flows, or send the message.
   * @param value - the input field's current value
   */
  private handleSubmit(value: string,): void {
    const committed = this.completer.accept();
    if (committed !== null) {
      this.input.setValue(committed,);
      this.completer.update(committed,);
      this.requestRender();
      return;
    }

    const trimmed = value.trim();
    // Client-side image-gen and upload: the TUI cannot rely on the web
    // frontend's command-action dispatch, so `/image` and `/upload` are
    // handled here. Anything else goes through the normal send path (the
    // server still dispatches its own `/image` command for other clients).
    if (trimmed.startsWith("/image ",)) {
      this.input.setValue("",);
      void this.generateImageFlow(trimmed.slice("/image ".length,),);
      return;
    }

    if (trimmed.startsWith("/upload ",)) {
      this.input.setValue("",);
      void this.uploadFlow(trimmed.slice("/upload ".length,),);
      return;
    }

    if (trimmed && !this.isSending) {
      void this.handleSend(trimmed,);
      // Clear only what was actually dispatched. A send already in flight can
      // run for minutes, and clearing here threw away whatever the user typed
      // while waiting for it.
      this.input.setValue("",);
      this.completer.update("",);
    }

    this.requestRender();
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
