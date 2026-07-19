/**
 * DB Schema — Content & Assets Tables
 *
 * Assets and polymorphic asset links.
 */
import type { Generated, } from "kysely";
import type { AssetLinkEntity, AssetType, AssetVisibility, StorageBackend, } from "./enums";

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
  visibility: AssetVisibility;
  width: number | null;
  height: number | null;
  duration_secs: number | null;
  alt_text: string | null;
  created_at: Generated<string>;
}

// ── Asset Links ───────────────────────────────────────────────
export interface AssetLinks {
  asset_id: string;
  entity_type: AssetLinkEntity;
  entity_id: string;
  label: string | null;
  sort_order: Generated<number>;
  created_at: Generated<string>;
}

// ── Asset Shares ──────────────────────────────────────────────
export interface AssetShares {
  id: Generated<string>;
  asset_id: string;
  shared_with_id: string;
  shared_by_id: string;
  created_at: Generated<string>;
}
