// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { formatHuman, toDate, } from "../../../utils/date";
import { DEFAULT_LOCALE, } from "../../i18n";
import type { ChatState, } from "../types";

export type ChatUtilsTime = Partial<ChatState> & ThisType<ChatState>;

/**
 * Viewer's local IANA timezone, resolved from the browser. The backend stores
 * dates as UNIX/ISO; the frontend renders them in the viewer's own timezone so
 * "now" matches the user's clock.
 */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** Active UI locale (set by saveLocale); falls back to the default. */
function activeLocale(): string {
  return globalThis.currentLocale ?? DEFAULT_LOCALE;
}

/** Time-only, locale + timezone aware display. */
function formatTimeOnly(iso: string,): string {
  if (!iso) { return ""; }
  const d = toDate(iso,);
  if (Number.isNaN(d.getTime(),)) { return ""; }
  return formatHuman(iso, { locale: activeLocale(), tz: browserTimeZone(), humanStyle: "time", },);
}

export const chatUtilsTime: ChatUtilsTime = {
  formatTime(iso: string,) {
    return formatTimeOnly(iso,);
  },

  formatTimeShort(iso: string,) {
    return formatTimeOnly(iso,);
  },

  formatDate(iso: string,) {
    if (!iso) { return ""; }
    const d = toDate(iso,);
    if (Number.isNaN(d.getTime(),)) { return ""; }
    // Locale/region + timezone aware human-readable date-time.
    return formatHuman(iso, { locale: activeLocale(), tz: browserTimeZone(), humanStyle: "datetime", },);
  },
};

/**
 * Shared locale/region + viewer-timezone aware date display for other Alpine
 * components. Centralizes the wiring so every frontend date render uses the
 * active i18n locale (globalThis.currentLocale) + the viewer's browser
 * timezone — not the runtime default (the defect behind the unsafe toLocale*
 * call sites). Mirrors the logic already applied to formatTime/formatDate.
 */
export function formatDisplayDate(
  iso: string | null | undefined,
  humanStyle: "date" | "time" | "datetime" = "datetime",
): string {
  if (!iso) { return ""; }
  const d = toDate(iso,);
  if (Number.isNaN(d.getTime(),)) { return ""; }
  return formatHuman(iso, { locale: activeLocale(), tz: browserTimeZone(), humanStyle, },);
}
