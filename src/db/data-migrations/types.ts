import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/**
 * Data Migration Interface
 *
 * Each data migration bumps one table from one version to the next.
 * Scripts are per-table and versioned independently.
 *
 * Connected tables: documented per-script as JSDoc, not auto-cascaded.
 * FK references are IDs — format changes stay local to their table.
 */

export interface DataMigration {
  /** Target table name */
  table: string;

  /** Version current rows are at before migration */
  fromVersion: number;

  /** Version rows should be at after migration */
  toVersion: number;

  /** Human-readable description of the transform */
  description: string;

  /**
   * Transform rows from `fromVersion` to `toVersion`.
   *
   * Query only rows where format_version = fromVersion.
   * After transforming, SET format_version = toVersion.
   * Must be idempotent: running twice on same data is safe.
   */
  up(db: Kysely<DB>,): Promise<void>;
}

/**
 * Registry entry for tracking which migrations have been applied.
 * Persisted in the `data_migrations` table.
 */
export interface DataMigrationRecord {
  table_name: string;
  from_version: number;
  to_version: number;
  description: string;
  applied_at: string;
}
