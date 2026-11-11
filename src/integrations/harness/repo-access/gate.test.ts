// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// repo-access/gate.test.ts — the fail-closed verdict chain + escalation
// audit. THE isolation matrix slice: user/external-agent cannot reach the
// repo-root tier; internal-service passes only when the operator enabled it.
//
// Resource contract (parallel-safe): one :memory: SQLite per file via
// createTestDb, the detector seam points at a unique mkdtemp root, the
// settings singleton resets per test; no ports, no env, no sleeps.
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdir, mkdtemp, rm, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { DB, } from "../../../db/schema";
import { principalKind, } from "../../../middleware/principal-kind";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import {
  assertRepoAccessExecution,
  REPO_ACCESS_AUDIT_TOOL,
  requestRepoRootChange,
} from "./gate";
import { type RepoAccessPrincipal, setRepoScopeRootDetectorForTests, } from "./principal-scope";
import { initRepoAccessSettings, resetRepoAccessSettings, } from "./settings";

let fixture: TestDb;
let db: Kysely<DB>;
let repoRoot: string;

const svc: RepoAccessPrincipal = { kind: principalKind("internal-service",), userId: "svc-1", };
const user: RepoAccessPrincipal = { kind: principalKind("user",), userId: "u-1", };
const agent: RepoAccessPrincipal = { kind: principalKind("external-agent",), userId: "a-1", };

async function auditRows(): Promise<Array<{ verdict: string; escalation_attempt: number; rationale: string }>> {
  return await db
    .selectFrom("tool_call_audit",)
    .select(["verdict", "escalation_attempt", "rationale",],)
    .where("tool", "=", REPO_ACCESS_AUDIT_TOOL,)
    .execute();
}

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  resetRepoAccessSettings();
  repoRoot = await mkdtemp(join(tmpdir(), "rsi-gate-",),);
  await mkdir(join(repoRoot, "tree", "agent-1",), { recursive: true, },);
  setRepoScopeRootDetectorForTests(() => repoRoot);
},);

afterEach(async () => {
  setRepoScopeRootDetectorForTests(null,);
  resetRepoAccessSettings();
  await rm(repoRoot, { recursive: true, force: true, },);
  await destroyTestDb(fixture,);
},);

describe("assertRepoAccessExecution — the fail-closed chain", () => {
  it("denies EVERYTHING while the tier is disabled (the default)", async () => {
    // Deliberately no init call: unseeded store = disabled.
    const v = await assertRepoAccessExecution({ principal: svc, db, },);
    expect(v,).toEqual({
      allowed: false,
      code: "repo_access_disabled",
      message: expect.stringContaining("disabled",),
    },);
  });

  it("denies the internal-service principal even when its grants would allow it, while disabled", async () => {
    initRepoAccessSettings({ enabled: false, },);
    const v = await assertRepoAccessExecution({
      principal: svc,
      required: "finalize:merge",
      db,
    },);

    expect(v.allowed,).toBe(false,);
    expect(v.allowed === false && v.code,).toBe("repo_access_disabled",);
  });

  it("admits internal-service with its repo root + grants when enabled", async () => {
    initRepoAccessSettings({ enabled: true, },);
    const v = await assertRepoAccessExecution({
      principal: svc,
      required: "check:run",
      db,
    },);

    expect(v.allowed,).toBe(true,);
    expect(v.allowed === true && v.root,).toBe(repoRoot,);
    expect(v.allowed === true && v.grants.has("check:run",),).toBe(true,);
  });

  it("denies users and external agents regardless of the switch (kind admission)", async () => {
    initRepoAccessSettings({ enabled: true, },);
    for (const principal of [user, agent,]) {
      const v = await assertRepoAccessExecution({ principal, db, },);
      expect(v.allowed,).toBe(false,);
      expect(v.allowed === false && v.code,).toBe("principal_denied",);
    }
  });

  it("denies a narrowed grant set missing the required capability", async () => {
    initRepoAccessSettings({ enabled: true, },);
    const v = await assertRepoAccessExecution({
      principal: svc,
      required: "finalize:merge",
      granted: ["check:run",],
      db,
    },);

    expect(v.allowed,).toBe(false,);
    expect(v.allowed === false && v.code,).toBe("capability_missing",);
  });

  it("runs the kind gate before root resolution (no worktree leak)", async () => {
    initRepoAccessSettings({ enabled: true, },);
    const v = await assertRepoAccessExecution({
      principal: { kind: principalKind("external-agent",), userId: "a-2", agentWorktree: undefined, },
      db,
    },);

    expect(v.allowed,).toBe(false,);
    expect(v.allowed === false && v.code,).toBe("principal_denied",);
  });

  it("denies with root_unresolved when git detection fails (enabled, correct kind)", async () => {
    initRepoAccessSettings({ enabled: true, },);
    setRepoScopeRootDetectorForTests(() => "");
    try {
      const v = await assertRepoAccessExecution({ principal: svc, db, },);
      expect(v.allowed,).toBe(false,);
      expect(v.allowed === false && v.code,).toBe("root_unresolved",);
    } finally {
      setRepoScopeRootDetectorForTests(null,);
    }
  });

  it("audits allow AND deny decisions into tool_call_audit", async () => {
    initRepoAccessSettings({ enabled: true, },);
    await assertRepoAccessExecution({ principal: svc, required: "check:run", db, },);
    await assertRepoAccessExecution({ principal: user, db, },);

    const rows = await auditRows();
    expect(rows,).toHaveLength(2,);
    expect(rows.map((r,) => r.verdict).sort(),).toEqual(["allowed", "denied",],);
    expect(rows.every((r,) => r.escalation_attempt === 0),).toBe(true,);
  });
});

describe("requestRepoRootChange — audited escalation, default deny", () => {
  it("always denies and records escalation_attempt = 1, for ANY principal", async () => {
    initRepoAccessSettings({ enabled: true, },);
    for (const principal of [svc, user, agent,]) {
      const denial = await requestRepoRootChange({
        principal,
        targetPath: "/etc",
        db,
      },);

      expect(denial.ok,).toBe(false,);
      expect(denial.ok === false && denial.code,).toBe("escalation_denied",);
    }

    const rows = await auditRows();
    expect(rows,).toHaveLength(3,);
    expect(rows.every((r,) => r.verdict === "denied"),).toBe(true,);
    expect(rows.every((r,) => r.escalation_attempt === 1),).toBe(true,);
  });

  it("records the request even while the tier is disabled", async () => {
    const denial = await requestRepoRootChange({ principal: user, targetPath: "/", db, },);
    expect(denial.ok,).toBe(false,);
    expect(await auditRows(),).toHaveLength(1,);
  });
});
