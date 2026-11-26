// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { DbType, } from "../../../../../src/db/enums";
import { createLogger, type Logger, setGlobalLogger, } from "../../logger";
import {
  databaseLocation,
  networkFilesystemWarning,
  resetDatabaseSafetyWarningsForTests,
  sharedDatabasePathWarning,
  unsupportedDbTypeWarning,
  warnDatabaseSafety,
} from "./db-warnings";

describe("unsupportedDbTypeWarning", () => {
  test("names the unsupported value and the supported one", () => {
    expect(unsupportedDbTypeWarning(DbType.Postgres,),).toBe(
      "db.type=postgres is not implemented in this build - running SQLite; db.url is ignored",
    );
  });

  test("stays silent for the implemented type and for a missing type", () => {
    expect(unsupportedDbTypeWarning(DbType.Sqlite,),).toBeNull();
    expect(unsupportedDbTypeWarning(undefined,),).toBeNull();
  });

  test("never recommends Postgres", () => {
    const warning = unsupportedDbTypeWarning(DbType.Postgres,) ?? "";
    expect(warning,).not.toContain("Postgres",);
    expect(warning,).not.toContain("switch to",);
  });
});

describe("sharedDatabasePathWarning", () => {
  test("warns for a pinned path, naming the variable and the remedy", () => {
    const warning = sharedDatabasePathWarning("/data/loop-lore.db",) ?? "";
    expect(warning,).toContain("/data/loop-lore.db",);
    expect(warning,).toContain("LOOP_LORE_DB_PATH",);
    expect(warning,).toContain("one instance per database file",);
    expect(warning,).not.toContain("Postgres",);
  });

  test("stays silent when no path is pinned", () => {
    expect(sharedDatabasePathWarning(undefined,),).toBeNull();
    expect(sharedDatabasePathWarning("",),).toBeNull();
  });
});

describe("databaseLocation", () => {
  test("follows the pinned path, else the state root", () => {
    expect(databaseLocation({ LOOP_LORE_DB_PATH: "/data/loop-lore.db", },),).toBe("/data/loop-lore.db",);
    expect(databaseLocation({ LOOP_LORE_STATE_DIR: "/state/loop-lore", },),).toBe("/state/loop-lore",);
  });
});

describe("networkFilesystemWarning", () => {
  test("stays silent for a local path", () => {
    expect(networkFilesystemWarning("/tmp/loop-lore.db",),).toBeNull();
  });
});

describe("warnDatabaseSafety", () => {
  test("emits a warning once per process", () => {
    resetDatabaseSafetyWarningsForTests();
    const messages: string[] = [];
    const record = (message: string,) => {
      messages.push(message,);
    };
    const stub = {
      warn: record,
      child: () => ({ warn: record, }),
    } as unknown as Logger;
    const previous = createLogger();
    setGlobalLogger(stub,);
    try {
      warnDatabaseSafety("probe-key", "probe message", {},);
      warnDatabaseSafety("probe-key", "probe message", {},);
    } finally {
      setGlobalLogger(previous,);
    }

    expect(messages,).toEqual(["probe message",],);
  });
});
