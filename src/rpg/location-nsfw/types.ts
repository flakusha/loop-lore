// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { NsfwLocationType, } from "../../db/enums";

/** Atmosphere scores for a location. */
export interface LocationAtmosphere {
  romantic: number;
  dangerous: number;
  comfortable: number;
  exotic: number;
  seedy: number;
}

/** Risk factors for a location. */
export interface LocationRisks {
  discovery: number;
  injury: number;
  arrest: number;
  reputation: number;
}

/** NSFW config for a location. */
export interface LocationNsfwConfig {
  id: string;
  locationId: string;
  locationType: NsfwLocationType;
  privacyLevel: string;
  discoveryChance: number;
  atmosphere: LocationAtmosphere;
  equipment: string[];
  risks: LocationRisks;
  createdAt: string;
  updatedAt: string;
}

/** Options for updating a location's NSFW config. */
export interface UpdateLocationNsfwOpts {
  locationType?: NsfwLocationType;
  privacyLevel?: string;
  discoveryChance?: number;
  atmosphere?: Partial<LocationAtmosphere>;
  equipment?: string[];
  risks?: Partial<LocationRisks>;
}
