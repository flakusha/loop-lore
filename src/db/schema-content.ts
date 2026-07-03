/**
 * DB Schema — Content & Assets Tables
 *
 * Assets and polymorphic asset links.
 */
import type { Generated } from "kysely";
import type { AssetType, StorageBackend } from "./enums";

// ── Assets ────────────────────────────────────────────────────
export interface Assets {
  id: Generated<string>;
  owner_id: string;
  filename: string;
  mime_type: string;
  asset_type: AssetType;
  size_bytes: number;
  storage_path: string;
  storage_backend: StorageBackend;
  width: number | null;
  height: number | null;
  duration_secs: number | null;
  alt_text: string | null;
  created_at: Generated<string>;
}

// ── Asset Links ───────────────────────────────────────────────
export interface AssetLinks {
  asset_id: string;
  entity_type: string;
  entity_id: string;
  label: string | null;
  sort_order: Generated<number>;
  created_at: Generated<string>;
}
