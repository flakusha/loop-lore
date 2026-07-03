// Content types — ContentEncoding sourced from ../db/enums
import type { ContentEncoding } from "../db/enums";

export type { ContentEncoding };

export interface EncodeResult {
  encoded: string;
  encoding: ContentEncoding;
}

export interface DecodeOptions {
  encoding: ContentEncoding;
}
