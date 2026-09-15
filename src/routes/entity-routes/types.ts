// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import type { Db, } from "../../db";
import type { HttpStatusCode, } from "../http-utils/status";

/** */
export interface EntityConfig {
  parentPrefix: string;
  parentParam?: string;
  entityPath: string;
  entityName: string;
  tableName: string;
  parentFk: string;
  ownershipTable: string;
  ownershipFkColumn: string;
  orderBy: { column: string; dir: "asc" | "desc" }[];
  filterField?: { param: string; column: string };
  fieldMappings: Record<string, string>;
  jsonFields: string[];
  defaults: Record<string, unknown>;
  createRequired: string[];
  /** Optional per-field value transforms applied on create/update (camel key → fn). */
  valueTransforms?: Record<string, (value: unknown,) => unknown>;
  /** Optional per-field transforms applied on read (camel key → fn) — inverse of valueTransforms. */
  responseTransforms?: Record<string, (value: unknown,) => unknown>;
  checkOwnership?: (opts: {
    database: Db;
    parentId: string;
    _entityId: string | null;
    userId: string | null;
    userRole: string | null;
  },) => Promise<boolean>;
  /**
   * Optional write guard for create/update/delete. Return a failure to reject
   * the write (e.g. scope restrictions). Receives the request body (empty for
   * delete) and the existing row when an entity is being modified.
   */
  writeGuard?: (opts: {
    body: Record<string, unknown>;
    existing: Record<string, unknown> | null;
    userId: string | null;
    userRole: string | null;
  },) => Promise<{ ok: true } | { ok: false; status: HttpStatusCode; message: string }>;
}
