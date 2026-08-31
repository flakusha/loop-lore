// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Synthetic Generator — Types
 *
 * Options type and shared generator state handle.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";

/** */
export interface SyntheticGeneratorOptions {
  db: Kysely<DB>;
  /** Override id generator (testing/injectable) */
  idGenerator?: () => string;
  /** Cap on cases produced per type */
  maxScenarios?: number;
}

/** Mutable view of the generator's dependencies threaded to dispatchers */
export interface GeneratorState {
  db: Kysely<DB>;
  idGenerator: () => string;
  maxScenarios: number;
}
