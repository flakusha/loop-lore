// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { DataMigration, } from "../types";

export const migration: DataMigration = {
  table: "personas",
  fromVersion: 1,
  toVersion: 2,
  description: "Personas v1 → v2: current format baseline (no transform)",

  async up(db,) {
    await db.updateTable("personas",).set({ format_version: 2, },).where("format_version", "=", 1,).execute();
  },
};
