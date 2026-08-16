// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ContentEncoding, } from "../db/enums";

export interface EncodeResult {
  encoded: string;
  encoding: ContentEncoding;
}

export interface DecodeOptions {
  encoding: ContentEncoding;
}

export { type ContentEncoding, } from "../db/enums";
