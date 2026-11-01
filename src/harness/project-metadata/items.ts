// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `.metadata/` folder handling (USER-APPROVED 2026-11-01 extension).
 *
 * The folder sits at the scope root and holds future items that are
 * extendable/linkable/regeneratable WITHOUT version bumps — `metadata_version`
 * governs ONLY the policy schema in the toml. Loader v1 validates NAMES and
 * CONTAINMENT; items never affect policy dims. Containment reuses the
 * realpath algorithm from the `worktree-scope` resolve path through the shared
 * `resolveReal`/`isWithinReal` primitive (`src/utils/realpath-within.ts`) —
 * imported directly because `worktree-scope` imports this module for the
 * detection hook, and a back-import would create a cycle.
 *
 * @module project-metadata/items
 */
import { existsSync, readdirSync, } from "node:fs";
import { join, } from "node:path";
import { isWithinReal, } from "../../utils/realpath-within";
import { METADATA_ITEM_KINDS, } from "./constants";
import type { MetadataItemKind, } from "./constants";
import { sinkEvent, sinkFinding, stringOr, } from "./normalize";
import type { MetadataIssueSink, } from "./normalize";
import type { MetadataFinding, MetadataItem, } from "./types";

/** Folder name at the scope root (USER-APPROVED extension). */
export const METADATA_FOLDER = ".metadata";

/**
 * Safe item name: `[A-Za-z0-9._-]+`, no leading dot beyond the folder itself
 * (so `.hidden` and `..` are rejected), no path separators. Length-capped at
 * filesystem-safe 255.
 */
export const ITEM_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

/** True when `name` is a safe `.metadata/` item name. */
export function isValidItemName(name: string,): boolean {
  return ITEM_NAME_PATTERN.test(name,);
}

/** One `[items."name"]` declaration. */
export interface MetadataItemDecl {
  name: string;
  /** Declared kind; null when absent or unknown (advisory, dropped). */
  kind: MetadataItemKind | null;
  description: string | null;
}

/**
 * Normalize `[items."name"]` declarations. Unsafe names are rejected with an
 * error finding + `metadata_item_escape` audit event (dim `items.name`) and
 * dropped; `kind` is advisory (unknown → null); `description` is free text.
 */
export function normalizeItemDecls(sink: MetadataIssueSink, doc: Record<string, unknown>,): MetadataItemDecl[] {
  const raw = doc.items;
  if (raw === undefined) { return []; }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw,)) {
    sinkFinding(sink, "error", "type_mismatch", "items: expected table of declarations", "items",);
    return [];
  }

  const decls: MetadataItemDecl[] = [];
  for (const [name, table,] of Object.entries(raw,)) {
    if (!isValidItemName(name,)) {
      sinkEvent(sink, "items.name", "metadata_item_escape", `unsafe item name "${name}" rejected`,);
      sinkFinding(
        sink,
        "error",
        "item_name_invalid",
        `items."${name}": name fails the safe-name pattern`,
        `items."${name}"`,
      );

      continue;
    }

    if (table === null || typeof table !== "object" || Array.isArray(table,)) {
      sinkFinding(sink, "error", "type_mismatch", `items."${name}": expected table`, `items."${name}"`,);
      continue;
    }

    const declared = table as Record<string, unknown>;
    const rawKind = declared.kind;
    let kind: MetadataItemKind | null = null;
    if (rawKind !== undefined) {
      if (typeof rawKind === "string" && (METADATA_ITEM_KINDS as readonly string[]).includes(rawKind,)) {
        kind = rawKind as MetadataItemKind;
      } else {
        // Advisory metadata: unknown kind → dropped (spec §1.4 advisory class).
        sinkEvent(
          sink,
          `items."${name}".kind`,
          "metadata_enum_unknown",
          `unknown kind "${String(rawKind,)}" → dropped (advisory)`,
        );

        sinkFinding(
          sink,
          "warning",
          "unknown_enum_advisory",
          `items."${name}".kind: unknown kind "${String(rawKind,)}" dropped`,
          `items."${name}".kind`,
        );
      }
    }

    decls.push({
      name,
      kind,
      description: stringOr(sink, declared.description, `items."${name}".description`, `items."${name}".description`,),
    },);
  }

  return decls;
}

/**
 * Scan `<root>/${METADATA_FOLDER}`: return the contained, safely-named entry
 * names. Every entry is containment-checked through `isWithinReal` — a
 * symlink pointing outside the scope root is rejected with an error finding
 * + `metadata_item_escape` event. A missing folder yields `[]`; an unreadable
 * folder yields `[]` plus a warning finding (fail-closed, not fatal).
 */
export function scanMetadataFolder(sink: MetadataIssueSink, root: string,): string[] {
  const folder = join(root, METADATA_FOLDER,);
  if (!existsSync(folder,)) { return []; }
  let dirents;
  try {
    dirents = readdirSync(folder, { withFileTypes: true, },);
  } catch (cause) {
    sinkFinding(
      sink,
      "warning",
      "item_escape",
      `.metadata/ folder unreadable; ignoring its items: ${cause instanceof Error ? cause.message : String(cause,)}`,
    );

    return [];
  }

  const contained: string[] = [];
  for (const dirent of dirents) {
    if (!isValidItemName(dirent.name,)) {
      sinkEvent(sink, "items.name", "metadata_item_escape", `unsafe item name "${dirent.name}" ignored`,);
      sinkFinding(sink, "error", "item_name_invalid", `.metadata/"${dirent.name}": name fails the safe-name pattern`,);
      continue;
    }

    const itemPath = join(folder, dirent.name,);
    if (!isWithinReal(root, itemPath,)) {
      sinkEvent(
        sink,
        `items."${dirent.name}"`,
        "metadata_item_escape",
        "item resolves outside the scope root (symlink escape)",
      );

      sinkFinding(
        sink,
        "error",
        "item_escape",
        `.metadata/"${dirent.name}" resolves outside the scope root`,
        dirent.name,
      );

      continue;
    }

    contained.push(dirent.name,);
  }

  return contained;
}

/**
 * Merge declarations with on-disk entries into the resolved items list.
 * Declared-but-absent entries are kept (`present: false`) — the validator
 * reports them as warnings; present-but-undeclared entries are kept with
 * null kind/description (the validator reports a lint).
 */
export function buildMetadataItems(decls: MetadataItemDecl[], presentNames: string[],): MetadataItem[] {
  const items = decls.map((decl,) => ({
    name: decl.name,
    kind: decl.kind,
    description: decl.description === "" ? null : decl.description,
    declared: true,
    present: presentNames.includes(decl.name,),
  }));

  for (const name of presentNames) {
    if (decls.some((decl,) => decl.name === name)) { continue; }
    items.push({ name, kind: null, description: null, declared: false, present: true, },);
  }

  items.sort((a, b,) => a.name.localeCompare(b.name,));
  return items;
}

/** Linkage findings between declarations and folder contents (validator). */
export function itemLinkageFindings(items: MetadataItem[],): MetadataFinding[] {
  const findings: MetadataFinding[] = [];
  for (const item of items) {
    if (item.declared && !item.present) {
      findings.push({
        severity: "warning",
        code: "item_missing",
        message: `items."${item.name}": declared but absent from .metadata/`,
      },);
    } else if (!item.declared && item.present) {
      findings.push({
        severity: "lint",
        code: "item_undeclared",
        message: `.metadata/"${item.name}": present but not declared in [items]`,
      },);
    }
  }

  return findings;
}
