// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Global DOM augmentations for the Alpine chat frontend.
 *
 * Declares the `Window` helpers and htmx/Alpine/htmx event surfaces the
 * pages rely on. Split from `types.ts` (file-size gate).
 */
import type {
  AlpineState,
  ChatState,
  NotificationBellState,
  NotificationCenterState,
  NotificationPrefsState,
  WorldEditState,
} from "./types";

declare global {
  interface DocumentEventMap {
    "htmx:configRequest": CustomEvent<{ headers: Record<string, string> }>;
    "htmx:beforeSwap": CustomEvent<{ content: string }>;
    "htmx:afterSwap": CustomEvent<{ target: Element }>;
    "htmx:load": CustomEvent<{ elt: Element }>;
    "htmx:responseError": CustomEvent<{ xhr?: XMLHttpRequest }>;
    "htmx:loadTheme": CustomEvent<{ theme?: string }>;
    "show-toast": CustomEvent<{ type?: string; message: string; icon?: string }>;
  }

  interface Window {
    app: () => {
      toasts: { type: string; msg: string; icon: string }[];
      currentTheme: string;
      sidebarOpen: boolean;
      currentLocale: string;
      localeStrings: Record<string, unknown>;
      init: () => void;
      applyTheme: (themeId: string,) => void;
      iconFor: (type: string,) => string;
      closeAllModals: () => void;
      loadLocale: (locale: string,) => Promise<void>;
      setLocale: (localeId: string,) => void;
      __: (key: string, fallback?: string,) => string;
    };
    notificationsBell: () => NotificationBellState;
    notificationPrefs: () => NotificationPrefsState;
    notificationCenter: () => NotificationCenterState;
    chatState: () => AlpineState<ChatState>;
    worldEditState: () => AlpineState<WorldEditState>;
    adminPage: () => unknown;
    Alpine: {
      $data: (el: HTMLElement,) => Record<string, unknown>;
      initTree: (el: HTMLElement,) => void;
      store: {
        <T = Record<string, unknown>,>(key: string,): T;

        <T = Record<string, unknown>,>(key: string, value: T,): void;
      };
    };
    htmx: {
      ajax: (method: string, url: string, opts: { target: string; swap: string },) => void;
      trigger: (elt: EventTarget | string, eventName: string, detail?: unknown,) => boolean;
      defineExtension: (
        name: string,
        extension: { onEvent?: (name: string, evt: CustomEvent,) => void },
      ) => void;
      process: (elt: HTMLElement,) => void;
    };
    __: (key: string, fallback?: string,) => string;
    __localeStrings: Record<string, string>;
    __THEMES: { id: string; name: string; file: string }[];
    apiFetch: (url: string, options?: RequestInit,) => Promise<Response>;
    toggleSidebar: () => void;
    toggleMessageSearch: () => void;
    closeSidebar: () => void;
    showToast: (type: string, message: string,) => void;
    applyTheme: (themeId: string,) => void;
    setLocale: (localeId: string,) => void;
  }

  var chatState: Window["chatState"];
  var worldEditState: Window["worldEditState"];
  var app: Window["app"];
  var notificationsBell: Window["notificationsBell"];
  var notificationPrefs: Window["notificationPrefs"];
  var notificationCenter: Window["notificationCenter"];
  var __USER_ID: string | undefined;
  var __SESSION_ID: string | undefined;
}
