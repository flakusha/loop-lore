// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * UI Store — single source of truth for all UI toggle/modal state.
 *
 * Every `$store.ui.*` property used in HTML templates MUST be declared here.
 * Both vendor.ts (primary init) and htmx.ts (safety net) import this object.
 *
 * To add a new UI toggle:
 *   1. Add the property here with its default value
 *   2. Use it in HTML via `$store.ui.yourProperty`
 *   3. No other file needs updating — vendor.ts + htmx.ts pick it up automatically
 */

export const uiStoreDefinition: Record<string, unknown> = {
  // ── Sidebar / panels ─────────────────────────────────
  showChatList: false,
  showGallery: false,
  showCharacterInfo: false,
  showMemoryPanel: false,
  showSectionsPanel: false,
  showBackgroundPanel: false,
  showLocationPanel: false,

  // ── Modals ───────────────────────────────────────────
  showUploadModal: false,
  showImportForm: false,
  showCreateForm: false,
  showEditModal: false,
  showPreviewModal: false,
  showChatSettings: false,
  showRenameModal: false,
  showPersonaForm: false,

  // ── State flags ──────────────────────────────────────
  hasActiveChat: false,
  userRole: "member",
  showGmPanel: false,
  showParticipants: false,
  showGmGuidance: false,
  showQuestLog: false,
  showSideChannels: false,
  // ── Unified GM & Assistant panel (C1 remainder) — active tab ──
  gmAssistantTab: "shadow",
  // ── Side-channels (C1) ───────────────────────────────
  sideChannels: [] as {
    id: string;
    name: string;
    type: string;
    mode: string;
    created_by: string;
    world_id: string | null;
    created_at: string;
    updated_at: string;
  }[],
  newSideChannelName: "",

  // ── Active entity refs ───────────────────────────────
  activePersona: null,
};
