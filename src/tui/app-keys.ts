// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * TUI Global Keyboard Shortcuts
 *
 * Every key the shell answers when no overlay wants it. Split out of `app.ts`
 * for the file-size gate; the bindings are one concern and reading them side
 * by side is the point.
 *
 * The invariant this file exists to protect: **an overlay must be able to take
 * the keyboard from the chat box, and give it back.** The chat textbox raises
 * `screen.grabKeys` while it reads, and `Screen._listenKeys` gates every
 * screen-level key on `!grabKeys` (`widgets/screen.js:591`) - so an overlay
 * shown without a matching `releaseInput()` is visible but completely deaf.
 * That is why every `show()` here is preceded by `releaseInput()` and every
 * `hide()` is followed by `focusInput()`.
 */

import type blessed from "blessed";
import { getLogger, } from "../logger";
import type { AssetView, } from "./asset-view";
import type { ChatWidget, } from "./chat";
import type { ChatPicker, } from "./chat-picker";
import type { HarnessView, } from "./harness";
import type { ModelsOverlay, } from "./models-overlay";

/** The slice of `TUIApp` the bindings need. */
export interface KeyBindingHost {
  screen: blessed.Widgets.Screen;
  chat: ChatWidget;
  assets: AssetView;
  chatPicker: ChatPicker;
  harness: HarnessView;
  models: ModelsOverlay;
  updateStatus(msg: string,): void;
  refreshProviderHealth(): void;
  shutdown(): never;
}

/**
 * Bind the shell's global shortcuts on `host.screen`.
 *
 * Call once, after every widget the handlers reach has been constructed.
 * @param host - the app surface the handlers operate on
 */
export function bindGlobalKeys(host: KeyBindingHost,): void {
  const { chat, chatPicker, models, harness, assets, screen, } = host;

  screen.key(["escape", "q", "C-c",], () => {
    // An open overlay swallows the key: Esc closes it rather than killing the
    // process. With nothing open, the key quits as before. Every overlay has a
    // `dismiss()` so this chain cannot drift out of sync with the toggles.
    // Each dismiss hands the keyboard back to the chat box, so Esc closes
    // an overlay and leaves a usable prompt rather than a dead screen.
    if (chatPicker.dismiss()) {
      chat.focusInput();

      return;
    }

    if (models.dismiss()) {
      chat.focusInput();

      return;
    }

    if (harness.dismiss()) {
      chat.focusInput();

      return;
    }

    host.shutdown();
  },);

  // F1 - toggle the chat picker. F2/F3 are the asset/harness toggles, F4 is
  // reserved by TASK-harness-topic-tui-surface, F5 is refresh.
  screen.key(["f1",], () => {
    if (chatPicker.isVisible()) {
      chatPicker.hide();
      chat.focusInput();
    } else {
      // Release the chat box first: an overlay cannot take focus while a
      // widget still holds `screen.grabKeys`.
      chat.releaseInput();
      chatPicker.show();
    }
  },);

  // F2 - toggle asset sidebar
  screen.key(["f2",], () => {
    assets.toggle();
    host.updateStatus(assets.isVisible() ? "Assets: visible" : "Assets: hidden",);
  },);

  // F3 - toggle harness view
  screen.key(["f3",], () => {
    if (harness.isVisible()) {
      harness.hide();
      chat.focusInput();
    } else {
      chat.releaseInput();
      harness.show();
      void harness.refresh();
    }

    host.updateStatus(harness.isVisible() ? "Harness: visible" : "Harness: hidden",);
  },);

  // F6 - toggle the models overlay. F4 stays reserved by
  // TASK-harness-topic-tui-surface; F6 is the next free key in this block.
  screen.key(["f6",], () => {
    if (models.isVisible()) {
      models.hide();
      chat.focusInput();
    } else {
      chat.releaseInput();
      models.show();
    }
  },);

  // F5 - refresh current chat messages
  screen.key(["f5",], () => {
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
  },);

  // Ctrl+L - clear messages display
  screen.key(["C-l",], () => {
    chat.clearMessages();
    host.updateStatus("display cleared",);
  },);
}
