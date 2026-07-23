/**
 * Locale Picker Alpine Component
 *
 * Dropdown for switching UI language.
 * Used in settings modal and sidebar.
 */

import { type Locale, LOCALE_REGISTRY, SUPPORTED_LOCALES, } from "../i18n";

export function localePicker() {
  return {
    open: false,
    currentLocale: "en" as string,

    init() {
      this.currentLocale = localStorage.getItem("locale",) || "en";
    },

    locales() {
      return SUPPORTED_LOCALES.map((localeId,) => {
        const info = LOCALE_REGISTRY[localeId];
        return { id: localeId, name: info.name, nativeName: info.nativeName, direction: info.direction, };
      },);
    },

    currentLabel() {
      const info = LOCALE_REGISTRY[this.currentLocale as Locale];
      return info ? `${info.nativeName} (${info.name})` : "English";
    },

    select(localeId: string,) {
      this.currentLocale = localeId;
      this.open = false;
      // Delegate to global setLocale (Alpine app or vanilla UI)
      if (typeof globalThis.setLocale === "function") {
        globalThis.setLocale(localeId,);
      }
      // Also trigger Alpine reactivity if available
      if (globalThis.Alpine) {
        const appData = Alpine.$data(document.querySelector("[x-data]",) as HTMLElement,);
        if (appData && typeof appData.setLocale === "function") {
          appData.setLocale(localeId,);
        }
      }
    },
  };
}
