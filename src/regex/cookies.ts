// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cookie Parsing Regex Patterns
 *
 * Patterns for extracting values from HTTP Cookie headers.
 *
 * Sources: src/middleware/auth.ts, src/middleware/i18n.ts, src/frontend/fe-fetch.ts
 */

/** Match ll_token cookie value: ll_token=<value> */
export const LL_TOKEN = /(?:^|;\s*)ll_token=([^;]+)/;

/** Match ll_locale cookie value: ll_locale=<2-letter-code> */
export const LL_LOCALE = /(?:^|;\s*)ll_locale=([a-z]{2})/;

/** Match csrf_token cookie value: csrf_token=<value> */
export const CSRF_TOKEN = /(?:^|;\s*)csrf_token=([^;]+)/;
