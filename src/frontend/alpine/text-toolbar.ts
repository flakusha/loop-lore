// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared text-surface toolbar (epic-chat-composer-flows).
 *
 * Alpine component attaching composer affordances — LLM enhance with undo,
 * markdown preview — to ANY host textarea, selected by CSS selector. No
 * ChatState, no `$refs.messageInput`: the host writes
 * `<div x-data="textToolbar({ target: '#some-textarea' })">` around the
 * `{{> text-toolbar.html}}` include. A missing target disables the toolbar
 * silently so hosts can render it unconditionally.
 */
import { autoResize, } from "./auto-resize";
import { renderPreviewHtml, } from "./composer-pre-send/preview";
import { t, } from "./i18n";
import { enhanceText, UndoEnhance, } from "./text-enhance";

/** Options for the host's `x-data="textToolbar(...)"` binding. */
export interface TextToolbarOptions {
  /** CSS selector of the host textarea this toolbar operates on. */
  target: string;
  /** Chat context for the style-* levels; omitted for chat-less surfaces. */
  chatId?: string;
}

interface TextToolbarComponent {
  open: boolean;
  enhancing: boolean;
  showPreview: boolean;
  previewHtml: string;
  undoDepth: number;
  /** True when the target selector resolved to nothing — UI hides itself. */
  disabled: boolean;
  chatId: string | undefined;
  $dispatch?: (event: string, detail?: unknown,) => void;
  init(): void;
  enhance(level: string,): Promise<void>;
  undo(): void;
  togglePreview(): void;
}

// Internal, non-reactive state kept off the Alpine data object.
interface ToolbarInternals {
  el: HTMLTextAreaElement | null;
  undo: UndoEnhance;
}

/**
 * @param opts
 * @returns The Alpine component object for `x-data`.
 */
export function textToolbar(opts: TextToolbarOptions,): TextToolbarComponent {
  const internals: ToolbarInternals = { el: null, undo: new UndoEnhance(5,), };

  const toolbar: TextToolbarComponent = {
    open: false,
    enhancing: false,
    showPreview: false,
    previewHtml: "",
    undoDepth: 0,
    disabled: false,
    chatId: opts.chatId,

    init() {
      const found = globalThis.document?.querySelector?.(opts.target,) ?? null;
      internals.el = found !== null ? found as HTMLTextAreaElement : null;
      this.disabled = internals.el === null;
    },

    /**
     * Enhance the target's text through the standalone local-first chain.
     * @param level - Gradation level.
     * @returns {void}
     */
    async enhance(level: string,) {
      const target = internals.el;
      if (this.enhancing || this.disabled || !target) { return; }
      const text = target.value.trim();
      if (!text) { return; }

      this.enhancing = true;
      try {
        let serverFailed = false;
        const improved = await enhanceText(
          { text, level, chatId: this.chatId, },
          {
            onServerFailure: (failure,) => {
              serverFailed = true;
              const message = failure.injectionBlocked
                ? t("toasts.promptInjectionBlocked",)
                : failure.message ?? t("toasts.promptImproveFailed",);

              this.$dispatch?.("show-toast", { type: "error", message, },);
            },
          },
        );

        if (!improved) {
          if (!serverFailed) {
            this.$dispatch?.("show-toast", { type: "error", message: t("toasts.promptImproveFailed",), },);
          }

          return;
        }

        internals.undo.push(target.value,);
        this.undoDepth = internals.undo.depth;
        target.value = improved;
        // Sync x-model bindings (Alpine only updates on real input events).
        target.dispatchEvent(new Event("input", { bubbles: true, },),);
        autoResize(target,);
        this.$dispatch?.("show-toast", { type: "success", message: t("toasts.promptImproved",), },);
      } catch {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.promptImproveFailed",), },);
      } finally {
        this.enhancing = false;
      }
    },

    /** Pop one pre-enhancement value back into the target. */
    undo() {
      const target = internals.el;
      if (this.disabled || !target) { return; }
      const previous = internals.undo.pop();
      if (previous === undefined) { return; }

      target.value = previous;
      this.undoDepth = internals.undo.depth;
      // Sync x-model bindings (Alpine only updates on real input events).
      target.dispatchEvent(new Event("input", { bubbles: true, },),);
      autoResize(target,);
      this.$dispatch?.("show-toast", { type: "success", message: t("toasts.promptRestored",), },);
    },

    /** Flip markdown preview and snapshot the current text as HTML. */
    togglePreview() {
      const target = internals.el;
      if (this.disabled || !target) { return; }

      this.showPreview = !this.showPreview;
      if (this.showPreview) {
        this.previewHtml = renderPreviewHtml(target.value,);
      }
    },
  };

  return toolbar;
}

(globalThis as unknown as Record<string, unknown>).textToolbar = textToolbar;
