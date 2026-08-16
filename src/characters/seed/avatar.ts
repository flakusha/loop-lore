// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/seed/avatar.ts — Avatar + system-user helpers for the character seeder

import type { Kysely, } from "kysely";
import { readFileSync, } from "node:fs";
import { basename, } from "node:path";
import { mimeFromExtension, } from "../../assets/service";
import type { CharactersConfig, } from "../../config/schema";
import { UserRole, UserStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";

/**
 * Normalize a species/race value for consistent storage.
 * Trims whitespace and title-cases each word (e.g. "high elf" -> "High Elf").
 * Matching in `isLoreVisibleTo` is case-insensitive, so this is for display/consistency.
 */
export function normalizeSpecies(value: string,): string {
  return value
    .trim()
    .replaceAll(/\s+/g, " ",)
    .replaceAll(/\S+/g, (w,) => w[0]!.toUpperCase() + w.slice(1,).toLowerCase(),);
}

/** Resolved avatar image for seeding. */
export interface ResolvedAvatar {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Resolve a template avatar source to image bytes.
 * `file` reads the bundled image from disk (path resolved relative to cwd).
 * `default` produces a minimal deterministic SVG placeholder so the wiring is always exercised.
 * Returns null when a `file` source cannot be read.
 */
export function resolveTemplateAvatar(
  source: NonNullable<CharactersConfig["templates"][number]["avatar"]>,
): ResolvedAvatar | null {
  if (source.type === "file") {
    try {
      const buffer = readFileSync(source.path,);
      const mimeType = mimeFromExtension(source.path,);
      return { buffer, mimeType, filename: basename(source.path,), };
    } catch {
      return null;
    }
  }
  // type === "default" — deterministic SVG placeholder
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
    '<rect width="256" height="256" fill="#4b5563"/>' +
    '<circle cx="128" cy="104" r="52" fill="#d1d5db"/>' +
    '<path d="M32 240c12-52 56-76 96-76s84 24 96 76z" fill="#d1d5db"/></svg>';
  return { buffer: Buffer.from(svg, "utf8",), mimeType: "image/svg+xml", filename: "default-avatar.svg", };
}

/** Stable id for the system user that owns assets of ownerless (system-seeded) characters. */
export const SYSTEM_USER_ID = "system-user";

/**
 * Ensure a system user row exists (idempotent) to satisfy the `assets.owner_id`
 * FK (`NOT NULL references users.id`) when a seeded character has no real owner.
 * Returns the id to use as the asset owner.
 */
export async function ensureSystemUser(database: Kysely<DB>,): Promise<string> {
  const existing = await database.selectFrom("users",).select("id",).where("id", "=", SYSTEM_USER_ID,)
    .executeTakeFirst();
  if (existing) { return existing.id; }
  await database
    .insertInto("users",)
    .values({
      id: SYSTEM_USER_ID,
      username: "system",
      display_name: "System",
      password_hash: null,
      role: UserRole.Admin,
      status: UserStatus.Active,
      settings: "{}",
      format_version: 0,
    },)
    .execute();
  return SYSTEM_USER_ID;
}
