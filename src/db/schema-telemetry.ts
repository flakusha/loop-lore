/**
 * DB Schema — Telemetry Domain
 *
 * Opt-in anonymized event tracking for operational observability.
 */
import type { Generated, } from "kysely";

export interface TelemetryEvents {
  id: Generated<string>;
  session_id: string | null;
  user_id: string | null;
  chat_id: string | null;
  event_type: string;
  event_data: string;
  source: Generated<string>;
  created_at: Generated<string>;
}
