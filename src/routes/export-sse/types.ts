import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

export interface HandlerOpts {
  database: Kysely<DB>;
}

export interface ExportJob {
  id: string;
  userId: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  total: number;
  currentStep: string;
  zipBuffer?: Buffer;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}
