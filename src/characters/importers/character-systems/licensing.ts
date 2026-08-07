// src/characters/importers/character-systems/licensing.ts — Import licensing data

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { CharacterSystemsExport, } from "../../exporters/character-systems";
import { errMsg, } from "../../shared/character-systems-utils";
import type { CharacterSystemsImportResult, } from "./types";

/** Import licensing into the character systems importer result. */
export async function importLicensing(
  db: Kysely<DB>,
  actorId: string,
  data: CharacterSystemsExport["licensing"],
  result: CharacterSystemsImportResult,
): Promise<void> {
  if (!data) { return; }

  try {
    const existing = await db.selectFrom("character_licensing",).where("actor_id", "=", actorId,).select("id",)
      .executeTakeFirst();
    const now = new Date().toISOString();
    if (existing) {
      await db.updateTable("character_licensing",).set({
        license_type: data.licenseType as any,
        custom_license_text: (data.customLicenseText as string) ?? null,
        attribution: (data.attribution as string) ?? null,
        allow_derivatives: (data.allowDerivatives as number) ?? 1,
        allow_commercial: (data.allowCommercial as number) ?? 1,
        share_alike: (data.shareAlike as number) ?? 0,
        updated_at: now,
      },).where("actor_id", "=", actorId,).execute();
    } else {
      await db.insertInto("character_licensing",).values({
        id: crypto.randomUUID(),
        actor_id: actorId,
        license_type: data.licenseType as any,
        custom_license_text: (data.customLicenseText as string) ?? null,
        attribution: (data.attribution as string) ?? null,
        allow_derivatives: (data.allowDerivatives as number) ?? 1,
        allow_commercial: (data.allowCommercial as number) ?? 1,
        share_alike: (data.shareAlike as number) ?? 0,
        created_at: now,
        updated_at: now,
      },).execute();
    }
    result.licensingImported = true;
  } catch (error: unknown) {
    result.errors.push(`Failed to import licensing: ${errMsg(error,)}`,);
  }
}
