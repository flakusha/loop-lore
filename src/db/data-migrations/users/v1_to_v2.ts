import type { DataMigration, } from "../types";

export const migration: DataMigration = {
  table: "users",
  fromVersion: 1,
  toVersion: 2,
  description: "Users v1 → v2: current format baseline (no transform)",

  async up(db,) {
    await db.updateTable("users",).set({ data_version: 2, },).where("data_version", "=", 1,).execute();
  },
};
