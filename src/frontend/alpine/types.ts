import type { ChatState, } from "./chat-types";
import type { WorldEditState, } from "./world-types";

export type {
  ChatState,
  GenerationDetail,
  GmConfig,
  GroupedMessage,
  Message,
  MessageAttachment,
  WorldChannelChat,
} from "./chat-types";
export type { EquipmentSlot, MemoryEntry, MemoryPanelState, RpgStats, StatusEffect, } from "./chat-types";
export type { WorldEditState, } from "./world-types";

/**
 * Alpine.js Component Types
 *
 * Only chat page uses Alpine now. All other pages use vanilla JS + HTMX.
 */

export interface AlpineMagicThis {
  $dispatch(event: string, detail?: unknown,): void;
  $nextTick(callback?: () => void,): Promise<void>;
  $refs: Record<string, HTMLElement>;
  $el: HTMLElement;
}

export type AlpineState<T,> = T & ThisType<T & AlpineMagicThis>;

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
  visibility?: string;
  /** Preview URL (constructed from asset ID) */
  url?: string;
  /** Preview type (alias for asset_type, used by media-preview-modal) */
  type?: string;
  /** Caption for preview modal */
  caption?: string;
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
  locations: { id: string; name: string; description: string | null; world_id: string }[];
}

export interface NotificationListItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: number;
}

export interface NotificationBellState {
  open: boolean;
  unreadCount: number;
  items: NotificationListItem[];
  init: () => void;
  refresh: () => Promise<void>;
  connect: () => void;
  toggle: () => void;
  iconFor: (type: string,) => string;
  markRead: (id: string,) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string,) => Promise<void>;
  goTo: (link: string | null,) => void;
}

export interface NotificationPrefsState {
  loaded: boolean;
  saving: boolean;
  enabled: Record<string, boolean>;
  mutedWorlds: string[];
  types: { key: string; label: string }[];
  init: () => void;
  refresh: () => Promise<void>;
  toggleType: (key: string,) => Promise<void>;
  toggleMuteWorld: (worldId: string,) => Promise<void>;
  save: () => Promise<void>;
}

/** A single notification row rendered by the notification center. */
export interface NotificationCenterItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: number;
  createdAt?: string;
}

/** Standalone notification center page component (`/views/notifications`). */
export interface NotificationCenterState {
  loaded: boolean;
  saving: boolean;
  items: NotificationCenterItem[];
  filter: "all" | "unread";
  showFilters: boolean;
  prefs: Record<string, boolean>;
  types: { key: string; label: string }[];
  init: () => void;
  refresh: () => Promise<void>;
  visible: () => NotificationCenterItem[];
  unreadCount: () => number;
  onOpen: (item: NotificationCenterItem,) => Promise<void>;
  markRead: (id: string,) => Promise<void>;
  markAllRead: () => Promise<void>;
  loadPrefs: () => Promise<void>;
  toggleType: (key: string,) => Promise<void>;
  savePrefs: () => Promise<void>;
  iconFor: (type: string,) => string;
  timeAgo: (iso: string | undefined,) => string;
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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Alpine.store generic is for caller convenience
        <T = Record<string, unknown>,>(key: string,): T;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Alpine.store generic is for caller convenience
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
  var __USER_ID: string | null | undefined;
  var __SESSION_ID: string | null | undefined;
}
