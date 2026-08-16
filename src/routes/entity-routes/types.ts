// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Db, } from "../../db";

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
}
