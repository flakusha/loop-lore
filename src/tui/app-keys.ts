// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI Global Keyboard Shortcuts (pi-tui)
 *
 * Every key the shell answers when no focused component claims it first.
 * Registered as one pi-tui input listener on the engine; pi-tui dispatches
 * focused-component keys BEFORE this listener (after an optional
 * `capturesInput` preflight), so a text field typing `q` never quits and the
 * chat picker's create prompt can swallow its own Escape.
 */

import { getLogger, } from "../logger";
import type { AssetView, } from "./asset-view";
import type { ChatWidget, } from "./chat";
import type { ChatPicker, } from "./chat-picker";
import type { HarnessView, } from "./harness";
import type { ModelsOverlay, } from "./models-overlay";
import { matchesKey, type TUI, } from "./pi";

/** The slice of `TUIApp` the bindings need. */
export interface KeyBindingHost {
  tui: TUI;
  chat: ChatWidget;
  assets: AssetView;
  chatPicker: ChatPicker;
  harness: HarnessView;
  models: ModelsOverlay;
  /** True while a text field is reading (chat input or picker prompt): `q`
   *  is ordinary text there and must not quit. */
  isTyping(): boolean;
  updateStatus(msg: string,): void;
  refreshProviderHealth(): void;
  shutdown(): never;
}

/** What an exclusive full-screen overlay must offer to be closable in a chain. */
export interface FullScreenOverlay {
  isVisible(): boolean;
  /** Close if open, reporting whether it was. */
  dismiss(): boolean;
}

/**
 * Bind the shell's global shortcuts on `host.tui`.
 *
 * @param host - the app shell
 * @returns the unsubscribe for tests
 */
export function bindGlobalKeys(host: KeyBindingHost,): () => void {
  const { chat, chatPicker, models, harness, assets, tui, } = host;

  /**
   * Close every full-screen overlay except `keep`.
   *
   * Two of them open at once used to leave the keyboard on the one underneath;
   * only the asset sidebar is left alone — it is not full-screen and does not
   * take the keyboard.
   */
  const closeOtherOverlays = (keep: FullScreenOverlay,): void => {
    for (const overlay of [chatPicker, harness, models,]) {
      if (overlay !== keep) { overlay.dismiss(); }
    }
  };

  const overlayOpen = (): boolean => chatPicker.isVisible() || harness.isVisible() || models.isVisible();

  // An open overlay swallows the key: Esc/q/Ctrl+C closes it rather than
  // killing the process. With nothing open, the key quits as before. Every
  // overlay has a `dismiss()` so this chain cannot drift out of sync with the
  // toggles. `q` is exempt while a text field is typing (see isTyping).
  const quitOrDismiss = (): void => {
    if (chatPicker.dismiss() || models.dismiss() || harness.dismiss()) {
      chat.focusInput();
      return;
    }

    host.shutdown();
  };

  return tui.addInputListener((data,) => {
    if (matchesKey(data, "escape",) || matchesKey(data, "ctrl+c",)) {
      quitOrDismiss();
      return { consume: true, };
    }

    if (data === "q" && !host.isTyping()) {
      quitOrDismiss();
      return { consume: true, };
    }

    // F1 - toggle the chat picker. F2/F3 are the asset/harness toggles, F4 is
    // reserved by TASK-harness-topic-tui-surface, F5 is refresh.
    if (matchesKey(data, "f1",)) {
      if (chatPicker.isVisible()) {
        chatPicker.hide();
        chat.focusInput();
      } else {
        closeOtherOverlays(chatPicker,);
        chatPicker.show();
      }

      return { consume: true, };
    }

    // F2 - toggle asset sidebar
    if (matchesKey(data, "f2",)) {
      assets.toggle();
      host.updateStatus(assets.isVisible() ? "Assets: visible" : "Assets: hidden",);
      return { consume: true, };
    }

    // F3 - toggle harness view; refresh on every open
    if (matchesKey(data, "f3",)) {
      if (harness.isVisible()) {
        harness.hide();
        chat.focusInput();
      } else {
        closeOtherOverlays(harness,);
        harness.show();
        void harness.refresh();
      }

      host.updateStatus(harness.isVisible() ? "Harness: visible" : "Harness: hidden",);
      return { consume: true, };
    }

    // F6 - toggle the models overlay. F4 stays reserved by
    // TASK-harness-topic-tui-surface; F6 is the next free key in this block.
    if (matchesKey(data, "f6",)) {
      if (models.isVisible()) {
        models.hide();
        chat.focusInput();
      } else {
        closeOtherOverlays(models,);
        models.show();
      }

      return { consume: true, };
    }

    // F5 - refresh current chat messages + provider health
    if (matchesKey(data, "f5",)) {
      // Health is a second, independent thing F5 refreshes; a chat with no id
      // still gets fresh provider state.
      host.refreshProviderHealth();
      void (async () => {
        const chatId = chat.getChatId();
        if (chatId) {
          host.updateStatus("refreshing messages...",);
          try {
            await chat.loadMessages();
            host.updateStatus(`chat: ${chatId.slice(0, 8,)}...`,);
          } catch (error: unknown) {
            getLogger()
              .child({ module: "tui", },)
              .error(
                "loadMessages failed",
                error instanceof Error ? error : new Error(String(error,),),
              );

            host.updateStatus("load failed",);
          }
        } else {
          host.updateStatus("no active chat",);
        }
      })();

      return { consume: true, };
    }

    // Ctrl+L - clear messages display
    if (matchesKey(data, "ctrl+l",)) {
      chat.clearMessages();
      host.updateStatus("display cleared",);
      return { consume: true, };
    }

    // Tab: chat completion cycling / input <-> transcript focus switch. An
    // overlay on top owns the keyboard, so Tab passes through untouched.
    if (data === "\t" || matchesKey(data, "tab",)) {
      if (overlayOpen()) { return undefined; }
      chat.handleTab();
      return { consume: true, };
    }

    // Asset sidebar navigation mirrors the old screen-level Left/Right/Enter
    // bindings: they act while the sidebar is visible and no text field is
    // reading and no overlay is stacked on top.
    if (!overlayOpen() && assets.isVisible() && !host.isTyping()) {
      if (matchesKey(data, "left",) || matchesKey(data, "right",) || matchesKey(data, "enter",)) {
        assets.handleInput(data,);
        return { consume: true, };
      }
    }

    return undefined;
  },);
}
