// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/assets.ts — assets section defaults
import { DATA_DIR, } from "../constants";
import type { AssetsConfig, } from "../schema";

export const ASSETS_DEFAULTS = {
  enabled: true,
  uploadDir: `${DATA_DIR}/uploads`,
  maxFileSize: 10_485_760,
  compression: true,
  signedUrlSecret: "",
  signedUrlExpirySeconds: 900,
} satisfies AssetsConfig;
