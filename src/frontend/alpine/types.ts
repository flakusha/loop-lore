import type { ChatState } from "./chat-types";
import type { WorldEditState } from "./world-types";

export type { ChatState, GroupedMessage, Message, MessageAttachment, GenerationDetail } from "./chat-types";
export type { WorldEditState } from "./world-types";

/**
 * Alpine.js Component Types
 *
 * Only chat page uses Alpine now. All other pages use vanilla JS + HTMX.
 */

export interface AlpineMagicThis {
  $dispatch(event: string, detail?: unknown): void;
  $nextTick(callback?: () => void): Promise<void>;
  $refs: Record<string, HTMLElement>;
  $el: HTMLElement;
}

export type AlpineState<T> = T & ThisType<T & AlpineMagicThis>;

export interface GalleryAsset {
  id: string;
  name?: string;
  filename?: string;
  asset_type?: string;
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  alt_text?: string;
}

export interface PreviewAsset {
  id: string;
  filename?: string;
  mime_type?: string;
  size_bytes?: number;
  asset_type?: string;
  avatar_asset_id?: string;
}

export interface WorldDetailInit {
  worldId: string;
  locations: Array<{ id: string; name: string; description: string | null; world_id: string }>;
}

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
      toasts: Array<{ type: string; msg: string; icon: string }>;
      currentTheme: string;
      sidebarOpen: boolean;
      currentLocale: string;
      localeStrings: Record<string, string>;
      init: () => void;
      applyTheme: (themeId: string) => void;
      iconFor: (type: string) => string;
      closeAllModals: () => void;
      loadLocale: (locale: string) => Promise<void>;
      setLocale: (localeId: string) => void;
      __: (key: string, fallback?: string) => string;
    };
    chatState: () => AlpineState<ChatState>;
    worldEditState: () => AlpineState<WorldEditState>;
    adminPage: () => unknown;
    Alpine: {
      $data: (el: HTMLElement) => Record<string, unknown>;
      initTree: (el: HTMLElement) => void;
      store: {
        <T = Record<string, unknown>>(key: string): T;
        <T = Record<string, unknown>>(key: string, value: T): void;
      };
    };
    htmx: {
      ajax: (method: string, url: string, opts: { target: string; swap: string }) => void;
      trigger: (elt: EventTarget | string, eventName: string, detail?: unknown) => boolean;
      defineExtension: (
        name: string,
        extension: { onEvent?: (name: string, evt: CustomEvent) => void },
      ) => void;
      process: (elt: HTMLElement) => void;
    };
    __: (key: string, fallback?: string) => string;
    __localeStrings: Record<string, string>;
    __THEMES: Array<{ id: string; name: string; file: string }>;
    apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
    toggleSidebar: () => void;
    closeSidebar: () => void;
    showToast: (type: string, message: string) => void;
    applyTheme: (themeId: string) => void;
    setLocale: (localeId: string) => void;
  }

  var chatState: Window["chatState"];
  var worldEditState: Window["worldEditState"];
  var app: Window["app"];
  var __USER_ID: string | null | undefined;
  var __SESSION_ID: string | null | undefined;
}
