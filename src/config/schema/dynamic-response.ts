// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/dynamic-response.ts — Dynamic-response optimization config type

import type { ResponseCompression, } from "../../db/enums";

/** */
export interface DynamicResponseConfig {
  /** Master toggle for dynamic-response optimization */
  enabled: boolean;
  /** Minify text bodies (strip whitespace + comments) before sending */
  minify: boolean;
  /** Validate that html/css/js bodies parse; log + skip minify on failure */
  validate: boolean;
  /** Compress bodies with Content-Encoding based on Accept-Encoding */
  compress: boolean;
  /** Preferred algorithm; "auto" picks br when the client advertises it, else gzip */
  compressAlgorithm: ResponseCompression;
  /** Minimum body size (bytes) before compression kicks in */
  compressThreshold: number;
}
