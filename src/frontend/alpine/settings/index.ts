// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { api, } from "./api";
import { backup, } from "./backup";
import { chat, } from "./chat";
import { general, } from "./general";
import { keynav, } from "./keynav";
import { quota, } from "./quota";
import { restartBanner, } from "./restart-banner";
import type { LocaleInfoArray, QuotaGaugeResource, SettingsState, } from "./types";

settingsPage = function(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
    activeTab: "general",
    displayName: "",
    birthDate: "",
    theme: "default",
    locale: "en",
    contentLocale: "",
    locales: [] as LocaleInfoArray,
    enterToSend: true,
    autoScroll: true,
    inlinePreview: true,
    localInferenceOptIn: false,
    detailLevel: "Immersion",
    provider: "OpenAI",
    providerList: [] as { name: string; label: string; status: string }[],
    apiKey: "",
    apiEndpoint: "",
    model: "",
    maxTokens: 128_000,
    temperature: 1,
    confirmDeleteText: "",
    saving: false,
    loaded: false,
    quotaResources: [] as QuotaGaugeResource[],
    quotaIsAdmin: false,
    quotaNotice: "",
    backupEnabled: false,
    backupTypes: { chat: true, asset: true, world: false, lore: false, },
    backupReport: [],
    backupNotice: "",
    nsfwConsent: null as null | {
      nsfwEnabled: boolean;
      maxRating: string;
      accessStatus: string;
      shadowNsfw: boolean;
      blockReason: string | null;
    },
    pendingRestartKeys: [],
    pendingRestartBannerDismissed: false,
    ...general(),
    ...chat(),
    ...api(),
    ...quota(),
    ...backup(),
    ...restartBanner(),
    ...keynav(),
  };
};
