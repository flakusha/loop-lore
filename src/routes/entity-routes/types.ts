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
  checkOwnership?: (opts: {
    database: Db;
    parentId: string;
    _entityId: string | null;
    userId: string | null;
    userRole: string | null;
  },) => Promise<boolean>;
}
