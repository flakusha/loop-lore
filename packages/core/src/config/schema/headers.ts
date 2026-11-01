// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/headers.ts — Response header policy config types
//
// (FExBE: browser feature / security / perf / observability)

import type { HeadersSection, } from "../sections/headers";

/**
 * Content-Security-Policy directive set.
 * Applied only to HTML views.
 *
 * `script-src` includes `'unsafe-eval'` because Alpine.js uses `new Function()`
 * internally for expression evaluation. Inline scripts are gated by a
 * per-request nonce emitted from `src/middleware/csp-nonce.ts`; we explicitly
 * do NOT add `'unsafe-inline'` because that would render the nonce machinery
 * meaningless (every inline script would pass the policy regardless of nonce).
 */
export interface CspConfig {
  /** Master toggle for CSP emission. */
  enabled: boolean;
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  imgSrc: string[];
  fontSrc: string[];
  connectSrc: string[];
  workerSrc: string[];
  objectSrc: string[];
  baseUri: string[];
  frameAncestors: string[];
  formAction: string[];
  /** Emit `upgrade-insecure-requests` (HTTPS deployments). */
  upgradeInsecureRequests: boolean;
  /** Emit as `Content-Security-Policy-Report-Only` (observe violations, don't enforce). */
  reportOnly: boolean;
}

/**
 * Response-header policy. Centralized, route-aware header injection engine.
 * Per-route behavior is classified at apply time (html / api / static / docs).
 */

export type HeadersConfig = InstanceType<typeof HeadersSection>;

/**
 * Strict-Transport-Security policy. Emitted only on HTTPS requests to
 * avoid lockout when the server is reached over plain HTTP (dev, internal
 * proxy). RFC 6797 recommends `max-age >= 31536000` (1 year).
 */
export interface HstsConfig {
  /** Master toggle. When false, the header is never emitted. */
  enabled: boolean;
  /** `max-age` value in seconds. */
  maxAge: number;
  /** Append `includeSubDomains`. */
  includeSubDomains: boolean;
  /** Append `preload`. Off by default — only enable after confirming the entire domain is HTTPS-only. */
  preload: boolean;
}
