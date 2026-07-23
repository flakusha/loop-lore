/**
 * Character Licensing Routes
 *
 * API endpoints for managing character licensing,
 * including CC0 public domain and custom licenses.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import { jsonCreated, jsonError, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

/** Convert boolean to 0/1 integer, with fallback for undefined. */
function booleanToInt(value: boolean | undefined, fallback: number,): number {
  return value === undefined ? fallback : (value ? 1 : 0);
}

export function characterLicensingRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return new Elysia({ name: "character-licensing", },)
    // ── Get licensing for an actor ─────────────────────────────
    .get("/api/actors/:actorId/licensing", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      const licensing = await database
        .selectFrom("character_licensing",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();

      if (!licensing) {
        return jsonError({ message: "Licensing not found", status: HttpStatus.NotFound, },);
      }
      return jsonResponse(licensing,);
    },)
    // ── Create or update licensing ─────────────────────────────
    .post("/api/actors/:actorId/licensing", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const body = ctx.body as Record<string, unknown>;

      const licenseType = body.licenseType as string | undefined;
      const customLicenseText = body.customLicenseText as string | undefined;
      const attribution = body.attribution as string | undefined;
      const allowDerivatives = body.allowDerivatives as boolean | undefined;
      const allowCommercial = body.allowCommercial as boolean | undefined;
      const shareAlike = body.shareAlike as boolean | undefined;

      // Upsert
      const existing = await database
        .selectFrom("character_licensing",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();

      if (existing) {
        await database
          .updateTable("character_licensing",)
          .set({
            license_type: (licenseType as any) ?? existing.license_type,
            custom_license_text: customLicenseText ?? existing.custom_license_text,
            attribution: attribution ?? existing.attribution,
            allow_derivatives: booleanToInt(allowDerivatives, existing.allow_derivatives,),
            allow_commercial: booleanToInt(allowCommercial, existing.allow_commercial,),
            share_alike: booleanToInt(shareAlike, existing.share_alike,),
            updated_at: new Date().toISOString(),
          },)
          .where("id", "=", existing.id,)
          .execute();
        return jsonResponse({ id: existing.id, updated: true, },);
      }

      const id = crypto.randomUUID();
      await database
        .insertInto("character_licensing",)
        .values({
          id,
          actor_id: actorId,
          license_type: (licenseType as any) ?? "proprietary",
          custom_license_text: customLicenseText ?? null,
          attribution: attribution ?? null,
          allow_derivatives: booleanToInt(allowDerivatives, 1,),
          allow_commercial: booleanToInt(allowCommercial, 0,),
          share_alike: booleanToInt(shareAlike, 0,),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },)
        .execute();

      return jsonCreated({ id, },);
    },)
    // ── Delete licensing ───────────────────────────────────────
    .delete("/api/actors/:actorId/licensing", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      await database
        .deleteFrom("character_licensing",)
        .where("actor_id", "=", actorId,)
        .execute();

      return jsonResponse({ ok: true, },);
    },);
}
