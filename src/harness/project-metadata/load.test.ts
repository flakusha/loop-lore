// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Loader matrix for the project metadata manifest. Parallel-safe: every test
 * builds its own mkdtemp fixture and removes it in afterEach.
 *
 * Resource contract: per-test mkdtemp dirs under tmpdir (removed in afterEach
 * on all paths); the metadata log source and the detection-hook memo set are
 * the only shared seams — each is set inside the tests that need it and
 * restored in afterEach, so defaults survive the suite. bun runs each test
 * file in its own process (--isolate), so the module-global seams cannot race
 * across files.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { basename, join, } from "node:path";
import type { Logger, } from "../../logger";
import {
  loadProjectMetadata,
  METADATA_FILE,
  type MetadataEvent,
  resetMetadataHookForTests,
  resetMetadataLogSourceForTests,
  setMetadataLogSourceForTests,
  validateProjectMetadataText,
} from "./index";

interface WarnRecord {
  message: string | Record<string, unknown>;
  meta: Record<string, unknown> | undefined;
}

/** Minimal recording logger capturing warn calls. */
function makeRecordingLogger(warns: WarnRecord[],): Logger {
  const self: Logger = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: (message, meta,) => {
      warns.push({ message, meta, },);
    },
    error: () => {},
    fatal: () => {},
    child: () => self,
    addTransport: () => {},
    setBindings: () => {},
    setLevel: () => {},
    flush: () => Promise.resolve(),
  };

  return self;
}

/** Drain the fire-and-forget audit hook (two macrotask ticks are plenty). */
async function drainHook(): Promise<void> {
  await new Promise((resolve,) => setImmediate(resolve,));
  await new Promise((resolve,) => setImmediate(resolve,));
}

let dirs: string[] = [];

/** Fresh per-test fixture root; removed in afterEach. */
function makeRoot(prefix: string,): string {
  const dir = mkdtempSync(join(tmpdir(), `meta-${prefix}-`,),);
  dirs.push(dir,);
  return dir;
}

function writeManifest(root: string, text: string,): void {
  writeFileSync(join(root, METADATA_FILE,), text,);
}

const VALID_MINIMAL = [
  "metadata_version = 1",
  "[identity]",
  'id = "acme"',
  'kind = "project"',
  "[shareability]",
  'tier = "linkable"',
  "[context]",
  'memory = "world"',
  "cross_project_search = true",
  "",
].join("\n",);

beforeEach(() => {
  dirs = [];
},);

afterEach(() => {
  resetMetadataHookForTests();
  resetMetadataLogSourceForTests();
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true, },);
  }

  dirs = [];
},);

describe("loadProjectMetadata", () => {
  test("returns spec §2 defaults for an absent file", async () => {
    const root = makeRoot("absent",);
    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    const value = result.value;
    expect(value.source,).toBe("default",);
    expect(value.scopeRoot,).toBe(root,);
    expect(value.identity,).toEqual({ id: basename(root,), kind: "worktree", worldRef: "", },);
    expect(value.shareability.tier,).toBe("throwaway",);
    expect(value.stack,).toEqual({ runtimes: [], tools: {}, build: "", test: "", checkout: [], },);
    expect(value.security,).toEqual({
      network: "undeclared",
      secrets: "undeclared",
      subprocess: "undeclared",
      auditHooks: [],
    },);

    expect(value.integration.plugin,).toEqual({ eligible: false, scopes: [], originCeiling: "local", },);
    expect(value.remotes,).toEqual([],);
    expect(value.sync.package,).toBe("observe",);
    expect(value.context,).toEqual({ memory: "user", crossProjectSearch: false, worldData: false, },);
    expect(value.events,).toEqual([],);
    expect(value.rawText,).toBeNull();
    expect(value.parsed,).toBeNull();
  });

  test("parses a valid minimal manifest", async () => {
    const root = makeRoot("valid",);
    writeManifest(root, VALID_MINIMAL,);
    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.source,).toBe("main",);
    expect(result.value.metadataVersion,).toBe(1,);
    expect(result.value.identity,).toEqual({ id: "acme", kind: "project", worldRef: "", },);
    expect(result.value.shareability.tier,).toBe("linkable",);
    expect(result.value.context.memory,).toBe("world",);
    expect(result.value.context.crossProjectSearch,).toBe(true,);
    expect(result.value.rawText,).toBe(VALID_MINIMAL,);
    expect(result.value.events,).toEqual([],);
  });

  test("fails closed on a future major: treated as absent + audit event", async () => {
    const root = makeRoot("future",);
    writeManifest(root, 'metadata_version = 2\n[shareability]\ntier = "collaborative"\n',);
    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.source,).toBe("default",);
    expect(result.value.shareability.tier,).toBe("throwaway",);
    expect(result.value.events.map((event: MetadataEvent,) => event.type),).toEqual(["metadata_version_future",],);
    expect(result.value.rawText,).not.toBeNull();
  });

  test("errors on a lesser major (no silent migration in v1)", async () => {
    const root = makeRoot("lesser",);
    writeManifest(root, "metadata_version = 0\n",);
    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("unsupported_version",);
  });

  test("errors when metadata_version is missing or mistyped", async () => {
    const missing = makeRoot("noversion",);
    writeManifest(missing, '[shareability]\ntier = "throwaway"\n',);
    const parsed = await loadProjectMetadata(missing,);
    expect(parsed.ok,).toBe(false,);
    if (!parsed.ok) { expect(parsed.error.code,).toBe("missing_version",); }

    const mistyped = makeRoot("badversion",);
    writeManifest(mistyped, 'metadata_version = "one"\n',);
    const mistypedResult = await loadProjectMetadata(mistyped,);
    expect(mistypedResult.ok,).toBe(false,);
    if (!mistypedResult.ok) { expect(mistypedResult.error.code,).toBe("invalid_version",); }
  });

  test("errors on unparsable TOML", async () => {
    const root = makeRoot("garbage",);
    writeManifest(root, "metadata_version = 1\n[broken\n",);
    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error.code,).toBe("parse",);
  });

  test("unknown policy enum degrades to the most restrictive value + event", async () => {
    const root = makeRoot("policy-enum",);
    writeManifest(
      root,
      [
        "metadata_version = 1",
        "[shareability]",
        'tier = "galactic"',
        "[context]",
        'memory = "galaxy"',
        "",
      ].join("\n",),
    );

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.shareability.tier,).toBe("throwaway",);
    expect(result.value.context.memory,).toBe("none",);
    const dims = result.value.events.filter((event,) => event.type === "metadata_enum_unknown").map((event,) =>
      event.dim
    );

    expect(dims,).toContain("shareability.tier",);
    expect(dims,).toContain("context.memory",);
    expect(result.value.findings.some((finding,) => finding.code === "unknown_enum_policy"),).toBe(true,);
  });

  test("unknown advisory entries drop + event; free lists keep strings", async () => {
    const root = makeRoot("advisory-enum",);
    writeManifest(
      root,
      [
        "metadata_version = 1",
        "[stack]",
        'runtimes = ["bun", "ruby"]',
        "[security]",
        'audit_hooks = ["exec", "brain-read"]',
        "",
      ].join("\n",),
    );

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.stack.runtimes,).toEqual(["bun", "ruby",],);
    expect(result.value.security.auditHooks,).toEqual(["exec",],);
    const dims = result.value.events.filter((event,) => event.type === "metadata_enum_unknown").map((event,) =>
      event.dim
    );

    expect(dims,).toEqual(["security.audit_hooks",],);
    expect(result.value.findings.some((finding,) => finding.code === "unknown_enum_advisory"),).toBe(true,);
  });

  test("unknown plugin scope is a policy error and is dropped", async () => {
    const root = makeRoot("scopes",);
    writeManifest(
      root,
      [
        "metadata_version = 1",
        "[integration.plugin]",
        "eligible = true",
        'scopes = ["tools", "root"]',
        "",
      ].join("\n",),
    );

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.integration.plugin.scopes,).toEqual(["tools",],);
    expect(result.value.findings.some((finding,) => finding.code === "unknown_enum_policy"),).toBe(true,);
  });

  test("preserves unknown vendor keys (raw text + parsed overlay)", async () => {
    const root = makeRoot("vendor",);
    writeManifest(
      root,
      [
        "metadata_version = 1",
        "[io.github.acme.custom]",
        'anything = "goes"',
        "",
      ].join("\n",),
    );

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    const overlay = (result.value.parsed?.io as Record<string, unknown> | undefined)?.github as
      | Record<string, unknown>
      | undefined;

    const custom = (overlay?.acme as Record<string, unknown> | undefined)?.custom as
      | Record<string, unknown>
      | undefined;

    expect(custom?.anything,).toBe("goes",);
    expect(result.value.rawText,).toContain("[io.github.acme.custom]",);
  });

  test("remote auth_class shapes: fixed + prefixed accepted, malformed → none", async () => {
    const root = makeRoot("auth",);
    writeManifest(
      root,
      [
        "metadata_version = 1",
        "[[remotes]]",
        'name = "origin"',
        'url = "https://example.com/acme.git"',
        'auth_class = "token-env:ACME_TOKEN"',
        "[[remotes]]",
        'name = "fork"',
        'url = "ssh://git@example.com/fork.git"',
        'auth_class = "principal:svc-bot"',
        "[[remotes]]",
        'name = "bad"',
        'url = "https://example.com/bad.git"',
        'auth_class = "token-env:1BAD"',
        "[[remotes]]",
        'name = "worse"',
        'url = "https://example.com/worse.git"',
        'auth_class = "bearer abc123"',
        "",
      ].join("\n",),
    );

    const result = await loadProjectMetadata(root,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    const byName = new Map(result.value.remotes.map((remote,) => [remote.name, remote.authClass,]),);
    expect(byName.get("origin",),).toBe("token-env:ACME_TOKEN",);
    expect(byName.get("fork",),).toBe("principal:svc-bot",);
    expect(byName.get("bad",),).toBe("none",);
    expect(byName.get("worse",),).toBe("none",);
    expect(result.value.events.some((event,) => event.dim === "remotes.auth_class"),).toBe(true,);
  });
});

describe("worktree narrowing clamp", () => {
  function writePair(mainTier: string, worktreeTier: string,): { main: string; worktree: string } {
    const main = makeRoot("main",);
    const worktree = makeRoot("wt",);
    writeManifest(
      main,
      `metadata_version = 1\n[identity]\nid = "acme"\n[shareability]\ntier = "${mainTier}"\n[integration.plugin]\neligible = true\nscopes = ["tools", "routes"]\n`,
    );

    writeManifest(
      worktree,
      `metadata_version = 1\n[shareability]\ntier = "${worktreeTier}"\n[integration.plugin]\neligible = false\nscopes = ["tools", "migrations"]\n`,
    );

    return { main, worktree, };
  }

  test("worktree attempt to widen is clamped + conflict event", async () => {
    const { main, worktree, } = writePair("linkable", "collaborative",);
    const result = await loadProjectMetadata(worktree, { mainRoot: main, },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.source,).toBe("worktree",);
    expect(result.value.shareability.tier,).toBe("linkable",);
    expect(result.value.identity.id,).toBe("acme",);
    expect(
      result.value.events.some((event,) => event.type === "metadata_conflict" && event.dim === "shareability.tier"),
    ).toBe(true,);
  });

  test("legitimate narrowing applies without conflict", async () => {
    const { main, worktree, } = writePair("linkable", "throwaway",);
    const result = await loadProjectMetadata(worktree, { mainRoot: main, },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.shareability.tier,).toBe("throwaway",);
    expect(
      result.value.events.some((event,) => event.type === "metadata_conflict" && event.dim === "shareability.tier"),
    ).toBe(false,);
  });

  test("plugin scopes intersect; identity comes from main; arrays replace", async () => {
    const { main, worktree, } = writePair("packageable", "isolated-private",);
    const result = await loadProjectMetadata(worktree, { mainRoot: main, },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.integration.plugin.eligible,).toBe(false,);
    expect(result.value.integration.plugin.scopes,).toEqual(["tools",],);
    expect(result.value.events.some((event,) => event.dim === "integration.plugin.scopes"),).toBe(true,);
  });

  test("both absent → defaults even in the chain", async () => {
    const main = makeRoot("plain-main",);
    const worktree = makeRoot("plain-wt",);
    const result = await loadProjectMetadata(worktree, { mainRoot: main, },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.value.shareability.tier,).toBe("throwaway",);
    expect(result.value.events,).toEqual([],);
  });
});

describe("audit hook (notifyScopeRootMetadata)", () => {
  test("emits structured events once per root via the logger", async () => {
    const root = makeRoot("hook",);
    writeManifest(root, 'metadata_version = 1\n[shareability]\ntier = "nope"\n',);
    const warns: WarnRecord[] = [];
    setMetadataLogSourceForTests(() => makeRecordingLogger(warns,));
    const { notifyScopeRootMetadata, } = await import("./audit");
    notifyScopeRootMetadata(root,);
    notifyScopeRootMetadata(root,);
    await drainHook();
    const lines = warns.filter((record,) => record.message === "metadata: metadata_enum_unknown");
    expect(lines.length,).toBe(1,);
    expect(lines[0]?.meta?.dim,).toBe("shareability.tier",);
    expect(lines[0]?.meta?.scopeRoot,).toBe(root,);
  });
});

describe("validateProjectMetadataText", () => {
  test("accepts a valid manifest", () => {
    const result = validateProjectMetadataText(VALID_MINIMAL,);
    expect(result.ok,).toBe(true,);
    expect(result.errors,).toEqual([],);
    expect(result.events,).toEqual([],);
  });

  test("rejects credential-shaped remote URLs (secret_shape)", () => {
    const result = validateProjectMetadataText([
      "metadata_version = 1",
      "[[remotes]]",
      'name = "origin"',
      'url = "https://user:ghp_hunter2@example.com/acme.git"',
      "",
    ].join("\n",),);

    expect(result.ok,).toBe(false,);
    expect(result.errors.filter((finding,) => finding.code === "secret_shape").length,).toBeGreaterThan(0,);
  });

  test("rejects a future major with an error finding + event", () => {
    const result = validateProjectMetadataText("metadata_version = 3\n",);
    expect(result.ok,).toBe(false,);
    expect(result.errors[0]?.code,).toBe("unsupported_version",);
    expect(result.events[0]?.type,).toBe("metadata_version_future",);
  });

  test("reports parse failure as an error", () => {
    const result = validateProjectMetadataText("[broken\n",);
    expect(result.ok,).toBe(false,);
    expect(result.errors[0]?.code,).toBe("parse",);
  });
});
