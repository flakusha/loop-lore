import type { DataMigration } from "../types";

export const migration: DataMigration = {
  table: "messages",
  fromVersion: 1,
  toVersion: 2,
  description: "Messages v1 → v2: current format baseline (no transform)",

  async up(db) {
    await db.updateTable("messages").set({ data_version: 2 }).where("data_version", "=", 1).execute();
  },
};
