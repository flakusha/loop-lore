// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export type {
  ChatPinRow,
  ChatState,
  GenerationDetail,
  GmConfig,
  GmGuidance,
  GmParticipant,
  GmTurnPriority,
  GroupedMessage,
  Message,
  MessageAttachment,
  MovementEvent,
  WorldChannelChat,
} from "./chat-types";
export type {
  AuditAction,
  AuditEntry,
  EquipmentSlot,
  MemoryEntry,
  MemoryPanelState,
  RpgQuestionInputKind,
  RpgQuestionOptionView,
  RpgQuestionPendingAnswer,
  RpgQuestionView,
  RpgStats,
  StatusEffect,
} from "./chat-types";
export type { WorldEditState, } from "./world-types";

/**
 * Alpine.js Component Types
 *
 * Only chat page uses Alpine now. All other pages use vanilla JS + HTMX.
 */

/** */
export interface AlpineMagicThis {
  $dispatch(event: string, detail?: unknown,): void;
  $nextTick(callback?: () => void,): Promise<void>;
  $refs: Record<string, HTMLElement>;
  $el: HTMLElement;
}

/** */
export type AlpineState<T,> = T & ThisType<T & AlpineMagicThis>;

/** */
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

/** Resolved system-prompt preview returned by the prompt-template endpoint. */
export interface PromptTemplateInfo {
  purpose: string;
  prompt: string;
  source: string;
  characterName: string | null;
  registryDefault: string;
  /** Per-chat prompt override (null = use default resolution). */
  override: string | null;
  /** True when an override is currently active for this chat. */
  usingOverride: boolean;
}

/** A quick-reply button: label + slash command, optional trigger event. */
export interface QuickReplyButton {
  label: string;
  command: string;
  trigger?: "startup" | "user" | "ai";
}

/** */
export interface PreviewAsset {
  id: string;
  filename?: string;
  mime_type?: string;
  size_bytes?: number;
  asset_type?: string;
  avatar_asset_id?: string;
}

/** */
export interface WorldDetailInit {
  worldId: string;
  locations: { id: string; name: string; description: string | null; world_id: string }[];
}

/** */
export interface NotificationListItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: number;
}

/** */
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

/** */
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
