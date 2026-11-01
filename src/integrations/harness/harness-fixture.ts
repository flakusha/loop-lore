// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * harness-fixture.ts — the composite ACP test fixture: one fake ACP server
 * (fake-acp-server.ts) plus one fresh in-memory SQLite database built by
 * create-test-db, released together by {@link HarnessFixture.cleanup}.
 *
 * Test-only; imported exclusively by *.test.ts. Every fixture owns its
 * subprocess and its DB — no shared ports, paths, or module state, so suites
 * stay parallel-safe. Driver and registry tests open one fixture per test;
 * the DB half is for suites that need persisted state next to the wire
 * fixture (usage ledgers, session records).
 */

import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { type FakeAcpEnv, type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";

/** Fixture tunables. */
export interface HarnessFixtureOptions {
  /** Behavior knobs for the fake ACP server; omit for a plain handshake+prompt server. */
  server?: FakeAcpEnv;
}

/** One fake ACP server + one fresh in-memory DB, disposed by `cleanup()`. */
export interface HarnessFixture extends TestDb {
  /** Fake ACP server; `argv` feeds a profile command, `readLog()` observes client reactions. */
  readonly server: FakeAcpServer;
  /** Stop the server and dispose the DB. Idempotent. */
  cleanup(): Promise<void>;
}

/**
 * Start a fake ACP server and open an in-memory migrated DB as one fixture.
 * @param options - server knobs; omit for defaults
 * @returns the fixture; the caller MUST `cleanup()` it in teardown.
 * @throws {Error} when the server temp dir cannot be created or migrations fail.
 */
export async function createHarnessFixture(options: HarnessFixtureOptions = {},): Promise<HarnessFixture> {
  const server = startFakeAcp(options.server ?? {},);
  const testDb = await createTestDb();
  let cleaned = false;

  return {
    server,
    db: testDb.db,
    sqlite: testDb.sqlite,
    async cleanup(): Promise<void> {
      if (cleaned) { return; }
      cleaned = true;
      server.stop();
      await destroyTestDb(testDb,);
    },
  };
}
