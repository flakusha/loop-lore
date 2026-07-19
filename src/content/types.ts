import type { ContentEncoding, } from "../db/enums";

export interface EncodeResult {
  encoded: string;
  encoding: ContentEncoding;
}

export interface DecodeOptions {
  encoding: ContentEncoding;
}

export { type ContentEncoding, } from "../db/enums";
