// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Access-surface normalizers: `[[remotes]]` (reference-only), `[sync]`
 * (package-manifest stance), `[context]` (opt-in breadth). Core declared
 * dims live in `dimensions.ts`. Fail-closed per dimension class (spec §1.4);
 * audit events + findings land on the shared sink.
 *
 * @module project-metadata/access
 */
import {
  CONTEXT_MEMORY_MODES,
  HOST_KINDS,
  REMOTE_VISIBILITIES,
  SYNC_STANCES,
} from "./constants";
import type {
  ContextMemory,
  HostKind,
  RemoteVisibility,
  SyncStance,
} from "./constants";
import {
  boolOr,
  parseAuthClass,
  scalarEnum,
  sinkEvent,
  sinkFinding,
  stringOr,
  tableAt,
} from "./normalize";
import type { MetadataIssueSink, } from "./normalize";
import type {
  MetadataContext,
  MetadataRemote,
  MetadataSync,
} from "./types";

/** Normalize `[[remotes]]` — references only; malformed auth_class → `none`. */
export function normalizeRemotes(sink: MetadataIssueSink, doc: Record<string, unknown>,): MetadataRemote[] {
  const raw = doc.remotes;
  if (raw === undefined) { return []; }
  if (!Array.isArray(raw,)) {
    sinkFinding(sink, "error", "type_mismatch", "remotes: expected array of tables", "remotes",);
    return [];
  }

  const remotes: MetadataRemote[] = [];
  for (const [index, row,] of raw.entries()) {
    if (row === null || typeof row !== "object" || Array.isArray(row,)) {
      sinkFinding(sink, "error", "type_mismatch", `remotes[${index}]: expected table`, `remotes[${index}]`,);
      continue;
    }

    remotes.push(normalizeRemoteRow(sink, row as Record<string, unknown>, index,),);
  }

  return remotes;
}

function normalizeRemoteRow(sink: MetadataIssueSink, table: Record<string, unknown>, index: number,): MetadataRemote {
  const pointer = `remotes[${index}]`;
  const name = stringOr(sink, table.name, "remotes.name", `${pointer}.name`,);
  if (name === "") {
    sinkFinding(sink, "error", "type_mismatch", "remotes[].name is required", `${pointer}.name`,);
  }

  const authRaw = stringOr(sink, table.auth_class, "remotes.auth_class", `${pointer}.auth_class`, "none",);
  let authClass = authRaw;
  if (authRaw !== "none" && parseAuthClass(authRaw,) === null) {
    sinkEvent(
      sink,
      "remotes.auth_class",
      "metadata_enum_unknown",
      `malformed auth_class "${authRaw}" → "none" (policy)`,
    );

    sinkFinding(
      sink,
      "error",
      "unknown_enum_policy",
      `remotes[].auth_class: malformed shape "${authRaw}"; using "none"`,
      `${pointer}.auth_class`,
    );

    authClass = "none";
  }

  return {
    name,
    url: stringOr(sink, table.url, "remotes.url", `${pointer}.url`,),
    hostKind: scalarEnum<HostKind>(sink, {
      value: table.host_kind,
      allowed: HOST_KINDS,
      dim: "remotes.host_kind",
      pointer: `${pointer}.host_kind`,
      fallbackMissing: "other",
      fallbackUnknown: "other",
      policy: false,
    },),
    visibility: scalarEnum<RemoteVisibility>(sink, {
      value: table.visibility,
      allowed: REMOTE_VISIBILITIES,
      dim: "remotes.visibility",
      pointer: `${pointer}.visibility`,
      fallbackMissing: "unknown",
      fallbackUnknown: "unknown",
      policy: false,
    },),
    authClass,
    defaultBranch: stringOr(sink, table.default_branch, "remotes.default_branch", `${pointer}.default_branch`,),
  };
}

/** Normalize `[sync]` — package stance is policy; unknown → `observe`. */
export function normalizeSync(sink: MetadataIssueSink, doc: Record<string, unknown>,): MetadataSync {
  const table = tableAt(doc, "sync",);
  const fields: Record<string, SyncStance> = {};
  const rawFields = table.fields;
  if (rawFields !== undefined && rawFields !== null && typeof rawFields === "object" && !Array.isArray(rawFields,)) {
    for (const [field, stance,] of Object.entries(rawFields,)) {
      fields[field] = scalarEnum<SyncStance>(sink, {
        value: stance,
        allowed: SYNC_STANCES,
        dim: `sync.fields.${field}`,
        pointer: `sync.fields.${field}`,
        fallbackMissing: "observe",
        fallbackUnknown: "observe",
        policy: true,
      },);
    }
  } else if (rawFields !== undefined) {
    sinkFinding(sink, "error", "type_mismatch", "sync.fields: expected table", "sync.fields",);
  }

  return {
    package: scalarEnum<SyncStance>(sink, {
      value: table.package,
      allowed: SYNC_STANCES,
      dim: "sync.package",
      pointer: "sync.package",
      fallbackMissing: "observe",
      fallbackUnknown: "observe",
      policy: true,
    },),
    fields,
  };
}

/** Normalize `[context]` — opt-in only; unknown → narrowest (spec §1.4). */
export function normalizeContext(sink: MetadataIssueSink, doc: Record<string, unknown>,): MetadataContext {
  const table = tableAt(doc, "context",);
  return {
    memory: scalarEnum<ContextMemory>(sink, {
      value: table.memory,
      allowed: CONTEXT_MEMORY_MODES,
      dim: "context.memory",
      pointer: "context.memory",
      fallbackMissing: "user",
      fallbackUnknown: "none",
      policy: true,
    },),
    crossProjectSearch: boolOr(
      sink,
      table.cross_project_search,
      "context.cross_project_search",
      "context.cross_project_search",
    ),
    worldData: boolOr(sink, table.world_data, "context.world_data", "context.world_data",),
  };
}
