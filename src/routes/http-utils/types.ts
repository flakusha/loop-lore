import type { TranslatorFn, } from "../../i18n/types";
import type { ErrorCode, HttpStatusCode, } from "./status";

// ── Response type shorthands ──────────────────────────────────

export interface ApiError {
  error: string;
  code?: ErrorCode;
  details?: unknown;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface PaginatedResponse<T,> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface JsonErrorOptions {
  message: string;
  status?: HttpStatusCode;
  code?: ErrorCode;
  /** Translation function — if provided, message is treated as i18n key */
  t?: TranslatorFn;
}

export interface JsonPaginatedOptions {
  data: unknown[];
  total: number;
  page: number;
  pageSize: number;
}
