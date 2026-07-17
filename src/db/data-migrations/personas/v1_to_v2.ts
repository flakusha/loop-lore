import type { DataMigration } from "../types";

export const migration: DataMigration = {
  table: "personas",
  fromVersion: 1,
  toVersion: 2,
  description: "Personas v1 → v2: current format baseline (no transform)",

  async up(db) {
    await db.updateTable("personas").set({ data_version: 2 }).where("data_version", "=", 1).execute();
  },
};
