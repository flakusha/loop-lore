import { api, } from "./api";
import { chat, } from "./chat";
import { general, } from "./general";
import type { LocaleInfoArray, SettingsState, } from "./types";

(globalThis as any).settingsPage = function(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
    activeTab: "general",
    displayName: "",
    birthDate: "",
    theme: "default",
    locale: "en",
    locales: [] as LocaleInfoArray,
    enterToSend: true,
    autoScroll: true,
    inlinePreview: true,
    detailLevel: "Immersion",
    provider: "OpenAI",
    apiKey: "",
    apiEndpoint: "",
    model: "",
    maxTokens: 128_000,
    temperature: 1,
    confirmDeleteText: "",
    saving: false,
    loaded: false,
    nsfwConsent: null as null | {
      nsfwEnabled: boolean;
      maxRating: string;
      accessStatus: string;
      shadowNsfw: boolean;
      blockReason: string | null;
    },
    ...general(),
    ...chat(),
    ...api(),
  };
};
