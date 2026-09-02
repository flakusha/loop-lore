// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/headers.ts — Response header policy config types
//
// (FExBE: browser feature / security / perf / observability)

import type {
  CrossOriginEmbedderPolicy,
  CrossOriginOpenerPolicy,
  CrossOriginResourcePolicy,
  XFrameOption,
} from "../../db/enums";

/**
 * Content-Security-Policy directive set.
 * Applied only to HTML views. `script-src` includes `'unsafe-eval'` because
 * Alpine.js uses `new Function()` internally for expression evaluation, and
 * `'unsafe-inline'` because Alpine's @x directive parsing uses innerHTML.
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
export interface HeadersConfig {
  /** Master toggle. When false, no headers are added. */
  enabled: boolean;
  /** `Referrer-Policy` value. */
  referrerPolicy: string;
  /** Emit `X-Content-Type-Options: nosniff`. */
  xContentTypeOptions: boolean;
  /** `X-Frame-Options`: "DENY" | "SAMEORIGIN" | null (omit). */
  xFrameOptions: XFrameOption | null;
  /** `Permissions-Policy` value (feature delegation). */
  permissionsPolicy: string;
  /** CSP directive set (HTML only). */
  csp: CspConfig;
  /** `Cross-Origin-Opener-Policy`. null = omit. */
  crossOriginOpenerPolicy: CrossOriginOpenerPolicy | null;
  /** `Cross-Origin-Embedder-Policy`. null = omit. */
  crossOriginEmbedderPolicy: CrossOriginEmbedderPolicy | null;
  /** `Cross-Origin-Resource-Policy` for static subresources. */
  crossOriginResourcePolicy: CrossOriginResourcePolicy | null;
  /** `Timing-Allow-Origin` for resource timing (performance measurement). */
  timingAllowOrigin: string;
  /** Append `immutable` to `Cache-Control` for content-hashed assets. */
  immutableHashedAssets: boolean;
  /** `Link: <...>; rel=preload` hints emitted on HTML documents. */
  linkPreload: string[];
  /** `Accept-CH` / `Critical-CH` client hint tokens emitted on HTML. */
  acceptClientHints: string[];
  /** Advertise Save-Data cooperativeness (informational). */
  saveData: boolean;
  /** Early Hints (103) — requires transport support. */
  earlyHints: { enabled: boolean };
  /** `Reporting-Endpoints` map (name → URL) for frontend telemetry. */
  reportingEndpoints: Record<string, string>;
  /** `NEL` policy JSON string (null = omit). */
  nel: string | null;
  /** Strict-Transport-Security policy (RFC 6797). Disabled by default to keep plain-HTTP dev working. */
  hsts: HstsConfig;
}

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
