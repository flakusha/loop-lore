/**
 * i18n Routes
 *
 * API endpoints for locale information and message translations.
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLocaleInfo, getSupportedLocales, } from "../i18n/locale-registry";
import { jsonResponse, } from "./http-utils";

export interface I18nRoutesOpts {
  database: Kysely<DB>;
}

/**
 * i18n API routes.
 *
 * GET /api/i18n/locales — List supported locales with metadata
 */
export function i18nRoutes({ database: _database, }: I18nRoutesOpts,) {
  return new Elysia({ name: "i18n", },)
    .get("/api/i18n/locales", () => {
      const supported = getSupportedLocales();
      const locales = [];
      for (const id of supported) {
        const info = getLocaleInfo(id,);
        locales.push({
          id: info?.id ?? id,
          name: info?.name ?? id,
          nativeName: info?.nativeName ?? id,
          direction: info?.direction ?? "ltr",
        },);
      }

      return jsonResponse({
        locales,
        default: "en",
      },);
    },);
}
