// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { LocaleInfo, } from "../../i18n";
import type { ShortcutEntry, } from "../shortcuts";

export type { LocaleInfo, };

/** */
export type LocaleInfoArray = LocaleInfo[];

/** */
export interface NsfwConsent {
  nsfwEnabled: boolean;
  maxRating: string;
  accessStatus: string;
  shadowNsfw: boolean;
  blockReason: string | null;
}

/**
 * Full shape of the settings page Alpine component. Sub-modules
 * (general/chat/api) are typed `Partial<SettingsState> & ThisType<SettingsState>`
 * and composed in index.ts, so each part sees the whole `this`.
 */
export interface SettingsState {
  activeTab: string;
  displayName: string;
  birthDate: string;
  theme: string;
  locale: string;
  /** Preferred content/translation language (users.settings.contentLocale; "" = unset). */
  contentLocale: string;
  locales: LocaleInfoArray;
  enterToSend: boolean;
  autoScroll: boolean;
  inlinePreview: boolean;
  localInferenceOptIn: boolean;
  detailLevel: string;
  provider: string;
  providerList: { name: string; label: string; status: string }[];
  apiKey: string;
  apiEndpoint: string;
  model: string;
  maxTokens: number;
  temperature: number;
  confirmDeleteText: string;
  saving: boolean;
  loaded: boolean;
  nsfwConsent: NsfwConsent | null;

  // Restart-required banner (TASK-restart-required-indicator-on-system-config-changes)
  pendingRestartKeys: string[];
  pendingRestartBannerDismissed: boolean;

  // Keyboard shortcut editor (keynav submodule, opt-in via the `keynav` flag)
  keynavEnabled: boolean;
  keymap: ShortcutEntry[];
  rebindingAction: string;
  rebindAwaitSecond: boolean;
  keynavError: string;
  loadPendingRestart(): Promise<void>;
  hasPendingRestart(): boolean;
  dismissRestartBanner(): void;
  init(): Promise<void>;
  loadLocales(): Promise<void>;
  loadSettings(): Promise<void>;
  loadProviders(): Promise<void>;
  loadNsfwConsent(): Promise<void>;
  nsfwRestrictionText(): string;
  saveGeneral(): Promise<void>;
  onLocaleChange(): Promise<void>;
  onContentLocaleChange(): Promise<void>;
  exportAllData(): Promise<void>;
  onConfirmDeleteInput(): void;
  deleteAllData(): Promise<void>;

  saveChat(): Promise<void>;

  saveApi(): Promise<void>;
  testConnection(): Promise<void>;
  persistSettings(payload: Record<string, unknown>,): Promise<void>;
  clearApiKey(): void;
  onProviderChange(): void;
  onTempInput(): void;

  loadKeymapSection(): void;
  startRebind(action: string,): void;
  cancelRebind(): void;
  handleRebindKeydown(e: KeyboardEvent,): void;
  resetKeymapToDefaults(): void;
  actionLabel(action: string,): string;
}
