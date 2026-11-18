// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 106_locations_integrity
 *
 * 013's self-parent and cross-world guards are INSERT-only, and the depth
 * ceiling (LOCATION_DEPTH_LIMIT = 12 in src/db/enums-story/world.ts) lives in
 * LocationTreeService. Raw SQL writes bypass all three. Add UPDATE twins and
 * depth guards so the invariants hold at the storage boundary.
 *
 * Append-only: no shipped migration is edited and no generated schema changes.
 * Resolves: B1/B2 fractal-locations DB integrity.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await sql`
    CREATE TRIGGER IF NOT EXISTS trg_locations_no_self_parent_on_update
    BEFORE UPDATE OF parent_location_id ON locations
    FOR EACH ROW
    WHEN NEW.parent_location_id IS NOT NULL AND NEW.parent_location_id = NEW.id
    BEGIN
      SELECT RAISE(ABORT, 'location cannot be its own parent');
    END
  `.execute(database,);

  await sql`
    CREATE TRIGGER IF NOT EXISTS trg_locations_cross_world_parent_on_update
    BEFORE UPDATE OF parent_location_id ON locations
    FOR EACH ROW
    WHEN NEW.parent_location_id IS NOT NULL
      AND (SELECT world_id FROM locations WHERE id = NEW.parent_location_id) IS NOT NULL
      AND (SELECT world_id FROM locations WHERE id = NEW.parent_location_id) <> NEW.world_id
    BEGIN
      SELECT RAISE(ABORT, 'cross-world parent rejected');
    END
  `.execute(database,);

  // A child's depth equals its parent's separator count: '/a/' has 2 slashes
  // and its child '/a/b/' sits at depth 2. So > 12 means too deep. A missing
  // parent yields NULL, and NULL > 12 is false (the FK handles that case).
  await sql`
    CREATE TRIGGER IF NOT EXISTS trg_locations_depth_limit_on_insert
    BEFORE INSERT ON locations
    FOR EACH ROW
    WHEN (SELECT length(path) - length(replace(path, '/', ''))
          FROM locations WHERE id = NEW.parent_location_id) > 12
    BEGIN
      SELECT RAISE(ABORT, 'location depth exceeds limit (12)');
    END
  `.execute(database,);

  await sql`
    CREATE TRIGGER IF NOT EXISTS trg_locations_depth_limit_on_update
    BEFORE UPDATE OF parent_location_id ON locations
    FOR EACH ROW
    WHEN (SELECT length(path) - length(replace(path, '/', ''))
          FROM locations WHERE id = NEW.parent_location_id) > 12
    BEGIN
      SELECT RAISE(ABORT, 'location depth exceeds limit (12)');
    END
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_locations_depth_limit_on_update`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS trg_locations_depth_limit_on_insert`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS trg_locations_cross_world_parent_on_update`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS trg_locations_no_self_parent_on_update`.execute(database,);
}
