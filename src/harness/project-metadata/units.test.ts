// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit matrix for the module's primitives and constants (complements the
 * loader/folder suites, which exercise them indirectly). Parallel-safe: no
 * filesystem fixtures — pure in-memory calls.
 *
 * Resource contract: no shared state, no fixtures, no seams touched. bun runs
 * each test file in its own process (--isolate).
 */
import { describe, expect, test, } from "bun:test";
import {
  normalizeContext,
  normalizeRemotes,
  normalizeSync,
} from "./access";
import { emitMetadataEvents, } from "./audit";
import {
  AUDIT_HOOKS,
  AUTH_CLASS_FIXED,
  AUTH_CLASS_PREFIXES,
  CONTEXT_MEMORY_MODES,
  HOST_KINDS,
  IDENTITY_KINDS,
  METADATA_EVENT_TYPES,
  METADATA_FINDING_CODES,
  METADATA_FINDING_SEVERITIES,
  METADATA_ITEM_KINDS,
  METADATA_SOURCES,
  METADATA_VERSION,
  PLUGIN_ORIGINS,
  PLUGIN_SCOPES,
  REMOTE_VISIBILITIES,
  SECURITY_NETWORK_MODES,
  SECURITY_SECRETS_MODES,
  SECURITY_SUBPROCESS_MODES,
  SHAREABILITY_TIERS,
  SYNC_STANCES,
} from "./constants";
import {
  normalizeIdentity,
  normalizeIntegration,
  normalizeSecurity,
  normalizeShareability,
  normalizeStack,
} from "./dimensions";
import {
  buildMetadataItems,
  ITEM_NAME_PATTERN,
  itemLinkageFindings,
  normalizeItemDecls,
  scanMetadataFolder,
} from "./items";
import {
  narrowNetwork,
  narrowOrdered,
  narrowOriginCeiling,
  narrowSecrets,
  narrowSubprocess,
} from "./lattices";
import {
  boolOr,
  parseAuthClass,
  scalarEnum,
  sinkEvent,
  sinkFinding,
  stringList,
  stringOr,
  tableAt,
} from "./normalize";
import type { MetadataIssueSink, } from "./normalize";
import { mergeWorktreeNarrowing, } from "./resolve";
import { DEFAULT_METADATA, type ResolvedProjectMetadata, } from "./types";

/** Empty sink for primitive-level calls. */
function makeSink(): MetadataIssueSink {
  return { events: [], findings: [], scopeRoot: "/x", };
}

describe("constants lattices", () => {
  test("shareability tiers ascend restriction → reach", () => {
    expect(SHAREABILITY_TIERS,).toEqual([
      "throwaway",
      "isolated-private",
      "linkable",
      "packageable",
      "collaborative",
    ],);

    expect(METADATA_VERSION,).toBe(1,);
    expect(IDENTITY_KINDS,).toEqual(["project", "worktree",],);
    expect(SYNC_STANCES,).toEqual(["observe", "declared", "authoritative",],);
    expect(CONTEXT_MEMORY_MODES,).toEqual(["none", "user", "world",],);
    expect(METADATA_SOURCES,).toEqual(["default", "main", "worktree",],);
    expect(METADATA_ITEM_KINDS,).toEqual(["linkable", "regeneratable",],);
    expect(METADATA_EVENT_TYPES,).toEqual([
      "metadata_version_future",
      "metadata_enum_unknown",
      "metadata_item_escape",
      "metadata_conflict",
    ],);
  });

  test("security ladders, plugin/remote vocabularies are complete", () => {
    expect(SECURITY_NETWORK_MODES,).toEqual(["undeclared", "none", "egress", "full",],);
    expect(SECURITY_SECRETS_MODES,).toEqual(["undeclared", "none", "references-only", "files-present",],);
    expect(SECURITY_SUBPROCESS_MODES,).toEqual(["undeclared", "none", "toolchain-only", "arbitrary",],);
    expect(AUDIT_HOOKS,).toEqual(["exec", "network", "file-write-outside", "secret-read",],);
    expect(PLUGIN_ORIGINS,).toEqual(["core", "community", "local",],);
    expect(PLUGIN_SCOPES,).toEqual([
      "routes",
      "tools",
      "agentRoles",
      "uiComponents",
      "eventHandlers",
      "migrations",
    ],);

    expect(HOST_KINDS,).toEqual(["github", "gitlab", "other",],);
    expect(REMOTE_VISIBILITIES,).toEqual(["unknown", "private", "internal", "public",],);
    expect(AUTH_CLASS_FIXED,).toEqual(["none", "ssh-agent", "credential-helper",],);
    expect(AUTH_CLASS_PREFIXES,).toEqual(["token-env:", "principal:",],);
    expect(METADATA_FINDING_CODES.length,).toBeGreaterThan(0,);
    expect(METADATA_FINDING_SEVERITIES,).toEqual(["error", "warning", "lint",],);
  });
});

describe("normalize primitives", () => {
  test("scalarEnum: missing → fallbackMissing, unknown → restrictive + event", () => {
    const sink = makeSink();
    expect(scalarEnum(sink, {
      value: undefined,
      allowed: ["a", "b",] as const,
      dim: "d",
      pointer: "d",
      fallbackMissing: "a" as const,
      fallbackUnknown: "b" as const,
      policy: true,
    },),).toBe("a",);

    expect(scalarEnum(sink, {
      value: "zzz",
      allowed: ["a", "b",] as const,
      dim: "d",
      pointer: "d",
      fallbackMissing: "a" as const,
      fallbackUnknown: "b" as const,
      policy: true,
    },),).toBe("b",);

    expect(sink.events,).toHaveLength(1,);
    expect(sink.findings[0]?.code,).toBe("unknown_enum_policy",);
  });

  test("stringOr/boolOr/stringList/tableAt degrade on type mismatch", () => {
    const sink = makeSink();
    expect(stringOr(sink, undefined, "d", "d", "fb",),).toBe("fb",);
    expect(stringOr(sink, 42, "d", "d",),).toBe("",);
    expect(boolOr(sink, "yes", "d", "d", true,),).toBe(true,);
    expect(stringList(sink, { value: "nope", allowed: ["a",], dim: "d", pointer: "d", policy: false, },),).toEqual([],);
    expect(stringList(sink, { value: ["a", "z", 3,], allowed: ["a",], dim: "d", pointer: "d", policy: true, },),)
      .toEqual(["a",],);

    expect(tableAt({ t: { k: 1, }, }, "t",),).toEqual({ k: 1, },);
    expect(tableAt({}, "missing",),).toEqual({},);
    expect(tableAt({ arr: [], }, "arr",),).toEqual({},);
  });

  test("parseAuthClass accepts fixed + prefixed shapes, rejects malformed", () => {
    expect(parseAuthClass("none",),).toBe("none",);
    expect(parseAuthClass("ssh-agent",),).toBe("ssh-agent",);
    expect(parseAuthClass("token-env:MY_VAR",),).toBe("token-env:MY_VAR",);
    expect(parseAuthClass("principal:svc.bot-1",),).toBe("principal:svc.bot-1",);
    expect(parseAuthClass("token-env:1BAD",),).toBeNull();
    expect(parseAuthClass("principal:.hidden",),).toBeNull();
    expect(parseAuthClass("bearer xyz",),).toBeNull();
  });

  test("sinkEvent/sinkFinding append to the sink", () => {
    const sink = makeSink();
    sinkEvent(sink, "d", "metadata_conflict", "detail",);
    sinkFinding(sink, "warning", "type_mismatch", "msg", "p",);
    expect(sink.events[0]?.type,).toBe("metadata_conflict",);
    expect(sink.findings[0]?.pointer,).toBe("p",);
  });
});

describe("lattices", () => {
  test("ordered lists narrow by index", () => {
    expect(narrowOrdered(["a", "b", "c",] as const, "c", "b",),).toBe("b",);
    expect(narrowOrdered(["a", "b", "c",] as const, "a", "b",),).toBe("a",);
  });

  test("security ladders: undeclared is dominated, declared compare by rank", () => {
    expect(narrowNetwork("undeclared", "full",),).toBe("full",);
    expect(narrowNetwork("egress", "full",),).toBe("egress",);
    expect(narrowNetwork("full", "none",),).toBe("none",);
    expect(narrowSecrets("files-present", "references-only",),).toBe("references-only",);
    expect(narrowSubprocess("arbitrary", "toolchain-only",),).toBe("toolchain-only",);
    expect(narrowOriginCeiling("local", "core",),).toBe("core",);
  });
});

describe("access-surface normalizers (direct)", () => {
  test("normalizeRemotes/Sync/Context read their tables", () => {
    const sink = makeSink();
    const doc = {
      remotes: [{ name: "origin", auth_class: "token-env:T", },],
      sync: { package: "authoritative", fields: { engines: "observe", }, },
      context: { memory: "world", world_data: true, },
    };

    const remotes = normalizeRemotes(sink, doc,);
    expect(remotes,).toHaveLength(1,);
    expect(remotes[0]?.authClass,).toBe("token-env:T",);
    expect(normalizeSync(sink, doc,).package,).toBe("authoritative",);
    expect(normalizeSync(sink, doc,).fields.engines,).toBe("observe",);
    expect(normalizeContext(sink, doc,),).toEqual({ memory: "world", crossProjectSearch: false, worldData: true, },);
  });
});

describe("dimension normalizers (direct)", () => {
  test("identity/shareability/stack/security read their tables", () => {
    const sink = makeSink();
    const doc = {
      identity: { id: "acme", kind: "project", world_ref: "w1", },
      shareability: { tier: "packageable", },
      stack: { runtimes: ["bun",], build: "bun run build", checkout: ["git submodule update",], },
      security: { network: "egress", subprocess: "toolchain-only", audit_hooks: ["exec",], },
      integration: { plugin: { eligible: true, scopes: ["tools",], origin_ceiling: "community", }, },
    };

    expect(normalizeIdentity(sink, doc,),).toEqual({ id: "acme", kind: "project", worldRef: "w1", },);
    expect(normalizeShareability(sink, doc,).tier,).toBe("packageable",);
    const stack = normalizeStack(sink, doc,);
    expect(stack.build,).toBe("bun run build",);
    expect(stack.runtimes,).toEqual(["bun",],);
    const security = normalizeSecurity(sink, doc,);
    expect(security.network,).toBe("egress",);
    expect(security.auditHooks,).toEqual(["exec",],);
    expect(normalizeIntegration(sink, doc,).plugin.originCeiling,).toBe("community",);
  });

  test("items: pattern, decls, build + linkage findings", () => {
    expect(ITEM_NAME_PATTERN.test("ok.name-1",),).toBe(true,);
    const sink = makeSink();
    const decls = normalizeItemDecls(sink, { items: { ghost: { kind: "linkable", }, }, },);
    expect(decls,).toHaveLength(1,);
    const items = buildMetadataItems(decls, [],);
    expect(items[0]?.present,).toBe(false,);
    expect(itemLinkageFindings(items,)[0]?.code,).toBe("item_missing",);
  });
});

describe("resolve/audit/items/types (direct)", () => {
  test("mergeWorktreeNarrowing narrows tier and reports conflict", () => {
    const main = {
      ...DEFAULT_METADATA,
      scopeRoot: "/m",
      source: "main",
      identity: { id: "acme", kind: "project", worldRef: "", },
    } as ResolvedProjectMetadata;

    const worktree = {
      ...DEFAULT_METADATA,
      scopeRoot: "/w",
      source: "worktree",
      shareability: { tier: "collaborative", sameInstanceProjects: true, },
    } as ResolvedProjectMetadata;

    const merged = mergeWorktreeNarrowing(main, worktree,);
    expect(merged.shareability.tier,).toBe("throwaway",);
    expect(merged.identity.id,).toBe("acme",);
    expect(merged.events.some((event,) => event.type === "metadata_conflict"),).toBe(true,);
  });

  test("emitMetadataEvents is a silent no-op without events or logger", () => {
    expect(() => emitMetadataEvents([],)).not.toThrow();
    expect(() => emitMetadataEvents([{ type: "metadata_conflict", dim: "d", detail: "x", scopeRoot: "/x", },],)).not
      .toThrow();
  });

  test("scanMetadataFolder tolerates a missing folder", () => {
    expect(scanMetadataFolder(makeSink(), "/definitely-missing-root",),).toEqual([],);
  });

  test("DEFAULT_METADATA is the frozen narrowest posture", () => {
    expect(DEFAULT_METADATA.shareability.tier,).toBe("throwaway",);
    expect(DEFAULT_METADATA.context,).toEqual({ memory: "user", crossProjectSearch: false, worldData: false, },);
    expect(Object.isFrozen(DEFAULT_METADATA,),).toBe(true,);
  });
});
