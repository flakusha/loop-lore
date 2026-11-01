// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/assets.ts — re-export: single source assetsMeta in sections/assets.ts
// DATA_DIR placeholder handling moved to the json-schema assembly boundary
// (index.ts): Meta defaults carry resolved paths, the published schema keeps
// portable ${DATA_DIR} placeholders.
import { assetsMeta, } from "../../sections/assets";

export const assets = assetsMeta;
