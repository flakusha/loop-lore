// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe Fetch — universal fetch wrapper with timeout, safe JSON, and Result type.
 *
 * Original module split into domain modules; this barrel preserves the
 * public import surface (`safe-fetch` / `safe-fetch/index`).
 */
export { safeFetch, } from "./fetch";
export { safeFetchWithRetry, } from "./retry";
export type { FetchAuth, FetchResult, SafeFetchOptions, } from "./types";
