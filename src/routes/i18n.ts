/**
 * i18n Routes
 *
 * API endpoints for locale information and message translations.
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLocaleInfo, getSupportedLocales, isLocale, } from "../i18n/locale-registry";
import { unauthorized, } from "../validation/middleware";
import { jsonError, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

export interface I18nRoutesOpts {
  database: Kysely<DB>;
}

/**
 * i18n API routes.
 *
 * GET /api/i18n/locales — List supported locales with metadata
 * PATCH /api/i18n/locale — Set user's preferred locale
 */
export function i18nRoutes({ database, }: I18nRoutesOpts,) {
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
    },)
    .patch(
      "/api/i18n/locale",
      async (ctx: any,) => {
        const userId = ctx.userId as string | null;
        if (!userId) {
          return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",);
        }

        const body = ctx.body as { locale?: string };
        const newLocale = body.locale;

        if (!newLocale) {
          return jsonError({
            message: ctx.t?.("i18n.localeRequired",) ?? "Locale is required",
            status: HttpStatus.BadRequest,
          },);
        }

        if (!isLocale(newLocale,)) {
          return jsonError({
            message: ctx.t?.("i18n.invalidLocale",) ?? "Invalid locale",
            status: HttpStatus.BadRequest,
          },);
        }

        // Update user settings with locale preference
        const user = await database
          .selectFrom("users",)
          .select("settings",)
          .where("id", "=", userId,)
          .executeTakeFirst();

        const currentSettings = user?.settings ? JSON.parse(user.settings,) : {};
        const updatedSettings = { ...currentSettings, locale: newLocale, };

        await database
          .updateTable("users",)
          .set({ settings: JSON.stringify(updatedSettings,), },)
          .where("id", "=", userId,)
          .execute();

        return jsonResponse({ locale: newLocale, },);
      },
      { body: t.Object({ locale: t.String(), },), },
    );
}
