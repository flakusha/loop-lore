import type { Kysely, } from "kysely";
import type { CanonicalCharacter, } from "../../characters/parser";
import type { DB, } from "../../db/schema";

export interface ImportActorOpts {
  character: CanonicalCharacter;
  format: string;
  warnings: string[];
  database: Kysely<DB>;
  userId: string;
  rawSource?: string;
  sourceFormat?: string;
  charxAssets?: { name: string; type: string; data: Buffer }[];
  uploadDir?: string;
}
