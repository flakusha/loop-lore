// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createConfigSchema, } from "../config/schema-class";
import { isBackupSchedulingEnabled, resetBackupScheduling, } from "../resource/backup-scheduler";
import { configureAppBackupScheduling, } from "./boot";

describe("app backup scheduling wiring", () => {
  test("defaults keep the scheduler inert", () => {
    resetBackupScheduling();
    try {
      configureAppBackupScheduling(createConfigSchema().defaults,);
      expect(isBackupSchedulingEnabled(),).toBe(false,);
    } finally {
      resetBackupScheduling();
    }
  });

  test("operator opt-in enables the one scheduler", () => {
    resetBackupScheduling();
    try {
      const config = structuredClone(createConfigSchema().defaults,);
      config.db.backupEnabled = true;
      configureAppBackupScheduling(config,);
      expect(isBackupSchedulingEnabled(),).toBe(true,);
    } finally {
      resetBackupScheduling();
    }
  });
});
