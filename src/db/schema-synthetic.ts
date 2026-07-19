/**
 * DB Schema — Synthetic Data Table
 *
 * Captured scenarios for automated testing and QA.
 */
import type { Generated, } from "kysely";
import type { SyntheticDataStatus, SyntheticDataType, } from "./enums";

// ── Synthetic Data ──────────────────────────────────────────
export interface SyntheticData {
  id: Generated<string>;
  chat_id: string | null;
  world_id: string | null;
  type: SyntheticDataType;
  source_data: string;
  generated_cases: string;
  metadata: string;
  status: SyntheticDataStatus;
  created_at: Generated<string>;
  validated_at: string | null;
  validated_by: string | null;
}
