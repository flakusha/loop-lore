import type { DataMigration, } from "../types";

/**
 * Actors v1 → v2: Current format — no transform needed.
 *
 * Connected tables: none affected — child tables reference via actor_id FK.
 *
 * This stub exists to verify the data migration runner works.
 * Replace with actual transform when actors settings/fields change format.
 */
export const migration: DataMigration = {
  table: "actors",
  fromVersion: 1,
  toVersion: 2,
  description: "Actors v1 → v2: current format baseline (no transform)",

  async up(db,) {
    await db.updateTable("actors",).set({ data_version: 2, },).where("data_version", "=", 1,).execute();
  },
};
