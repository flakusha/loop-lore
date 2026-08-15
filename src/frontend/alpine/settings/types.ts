export interface LocaleInfo {
  id: string;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
}

export type LocaleInfoArray = LocaleInfo[];

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
  locales: LocaleInfoArray;
  enterToSend: boolean;
  autoScroll: boolean;
  inlinePreview: boolean;
  detailLevel: string;
  provider: string;
  apiKey: string;
  apiEndpoint: string;
  model: string;
  maxTokens: number;
  temperature: number;
  confirmDeleteText: string;
  saving: boolean;
  loaded: boolean;
  nsfwConsent: NsfwConsent | null;

  init(): Promise<void>;
  loadLocales(): Promise<void>;
  loadSettings(): Promise<void>;
  loadNsfwConsent(): Promise<void>;
  nsfwRestrictionText(): string;
  saveGeneral(): Promise<void>;
  onLocaleChange(): Promise<void>;
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
}
