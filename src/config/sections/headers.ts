// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/headers.ts — Headers config section

import type { CspConfig, HeadersConfig, } from "../schema";

export const CSP_DEFAULTS: CspConfig = {
  enabled: true,
  defaultSrc: ["'self'",],
  // BUG-csp-unsafe-inline-defeats-per-request-nonce:
  // Inline scripts must carry a per-request nonce (see src/middleware/csp-nonce.ts).
  // `'unsafe-eval'` stays because Alpine.js uses Function()/eval internally for
  // expression evaluation; once Alpine is replaced with the v3 build that compiles
  // expressions statically, this can drop too.
  scriptSrc: ["'self'", "'unsafe-eval'", "https://cdn.jsdelivr.net",],
  styleSrc: ["'self'", "'unsafe-inline'",],
  imgSrc: ["'self'", "data:", "blob:",],
  fontSrc: ["'self'",],
  connectSrc: ["'self'", "wss:", "https:",],
  workerSrc: ["'self'", "blob:",],
  objectSrc: ["'none'",],
  baseUri: ["'self'",],
  frameAncestors: ["'none'",],
  formAction: ["'self'",],
  upgradeInsecureRequests: true,
  reportOnly: false,
};

export const HEADERS_DEFAULTS: HeadersConfig = {
  enabled: true,
  referrerPolicy: "strict-origin-when-cross-origin",
  xContentTypeOptions: true,
  xFrameOptions: "DENY" as const,
  permissionsPolicy:
    "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), microphone=(), usb=()",
  csp: CSP_DEFAULTS,
  crossOriginOpenerPolicy: "same-origin" as const,
  crossOriginEmbedderPolicy: "credentialless" as const,
  crossOriginResourcePolicy: "cross-origin" as const,
  timingAllowOrigin: "",
  immutableHashedAssets: true,
  linkPreload: ["/alpine-init.js", "/css/app.css",],
  acceptClientHints: [],
  saveData: false,
  earlyHints: { enabled: false, },
  reportingEndpoints: {},
  nel: null,
  // HSTS defaults — disabled so plain-HTTP dev still works. Operators
  // flip `enabled: true` once the deployment is HTTPS-only.
  hsts: { enabled: false, maxAge: 31536000, includeSubDomains: true, preload: false, },
};

/** */
export class HeadersSection implements HeadersConfig {
  enabled = HEADERS_DEFAULTS.enabled;
  referrerPolicy = HEADERS_DEFAULTS.referrerPolicy;
  xContentTypeOptions = HEADERS_DEFAULTS.xContentTypeOptions;
  xFrameOptions = HEADERS_DEFAULTS.xFrameOptions;
  permissionsPolicy = HEADERS_DEFAULTS.permissionsPolicy;
  csp: CspConfig = { ...HEADERS_DEFAULTS.csp, };
  crossOriginOpenerPolicy = HEADERS_DEFAULTS.crossOriginOpenerPolicy;
  crossOriginEmbedderPolicy = HEADERS_DEFAULTS.crossOriginEmbedderPolicy;
  crossOriginResourcePolicy = HEADERS_DEFAULTS.crossOriginResourcePolicy;
  timingAllowOrigin = HEADERS_DEFAULTS.timingAllowOrigin;
  immutableHashedAssets = HEADERS_DEFAULTS.immutableHashedAssets;
  acceptClientHints = [...HEADERS_DEFAULTS.acceptClientHints,];
  saveData = HEADERS_DEFAULTS.saveData;
  linkPreload = [...HEADERS_DEFAULTS.linkPreload,];
  reportingEndpoints: Record<string, string> = {};
  nel = HEADERS_DEFAULTS.nel;
  hsts = { ...HEADERS_DEFAULTS.hsts, };
  earlyHints = { ...HEADERS_DEFAULTS.earlyHints, };
  /**
   * @param overrides
   */
  constructor(overrides?: Partial<HeadersConfig>,) {
    if (!overrides) { return; }

    const { csp, earlyHints, linkPreload, acceptClientHints, reportingEndpoints, ...rest } = overrides;
    Object.assign(this, rest,);
    if (csp) {
      this.csp = { ...this.csp, ...csp, };
    }
    if (earlyHints) {
      this.earlyHints = { ...this.earlyHints, ...earlyHints, };
    }
    if (linkPreload) {
      this.linkPreload = [...linkPreload,];
    }
    if (acceptClientHints) {
      this.acceptClientHints = [...acceptClientHints,];
    }
    if (reportingEndpoints) {
      this.reportingEndpoints = { ...reportingEndpoints, };
    }
  }
}

export const headersMeta = {
  type: "object" as const,
  description: "Response-header policy (browser security / isolation / perf / observability)",
  properties: {
    enabled: { type: "boolean", default: HEADERS_DEFAULTS.enabled, description: "Master toggle for header injection", },
    referrerPolicy: { type: "string", default: HEADERS_DEFAULTS.referrerPolicy, description: "Referrer-Policy value", },
    xContentTypeOptions: {
      type: "boolean",
      default: HEADERS_DEFAULTS.xContentTypeOptions,
      description: "Emit X-Content-Type-Options: nosniff",
    },
    xFrameOptions: {
      type: ["string", "null",],
      enum: ["DENY", "SAMEORIGIN", null,],
      default: HEADERS_DEFAULTS.xFrameOptions,
      description: "X-Frame-Options; null omits",
    },
    permissionsPolicy: {
      type: "string",
      default: HEADERS_DEFAULTS.permissionsPolicy,
      description: "Permissions-Policy feature delegation",
    },
    csp: {
      type: "object",
      description: "Content-Security-Policy directive set (HTML only)",
      properties: {
        enabled: { type: "boolean", default: CSP_DEFAULTS.enabled, },
        defaultSrc: { type: "array", items: { type: "string", }, default: CSP_DEFAULTS.defaultSrc, },
        scriptSrc: { type: "array", items: { type: "string", }, default: CSP_DEFAULTS.scriptSrc, },
        styleSrc: { type: "array", items: { type: "string", }, default: CSP_DEFAULTS.styleSrc, },
        imgSrc: { type: "array", items: { type: "string", }, default: CSP_DEFAULTS.imgSrc, },
        fontSrc: { type: "array", items: { type: "string", }, default: CSP_DEFAULTS.fontSrc, },
        connectSrc: { type: "array", items: { type: "string", }, default: CSP_DEFAULTS.connectSrc, },
        workerSrc: { type: "array", items: { type: "string", }, default: CSP_DEFAULTS.workerSrc, },
        objectSrc: { type: "array", items: { type: "string", }, default: CSP_DEFAULTS.objectSrc, },
        baseUri: { type: "array", items: { type: "string", }, default: CSP_DEFAULTS.baseUri, },
        frameAncestors: { type: "array", items: { type: "string", }, default: CSP_DEFAULTS.frameAncestors, },
        formAction: { type: "array", items: { type: "string", }, default: CSP_DEFAULTS.formAction, },
        upgradeInsecureRequests: { type: "boolean", default: CSP_DEFAULTS.upgradeInsecureRequests, },
        reportOnly: {
          type: "boolean",
          default: CSP_DEFAULTS.reportOnly,
          description: "Emit CSP as Report-Only (observe, not enforce)",
        },
      },
      required: ["enabled",],
    },
    crossOriginOpenerPolicy: {
      type: ["string", "null",],
      enum: ["same-origin", "same-origin-allow-popups", null,],
      default: HEADERS_DEFAULTS.crossOriginOpenerPolicy,
      description: "COOP; null omits",
    },
    crossOriginEmbedderPolicy: {
      type: ["string", "null",],
      enum: ["require-corp", "credentialless", null,],
      default: HEADERS_DEFAULTS.crossOriginEmbedderPolicy,
      description: "COEP; credentialless keeps no-credential CDN/model loads working while enabling SAB/WASM threads.",
    },
    crossOriginResourcePolicy: {
      type: ["string", "null",],
      enum: ["same-origin", "cross-origin", null,],
      default: HEADERS_DEFAULTS.crossOriginResourcePolicy,
      description: "CORP for static subresources",
    },
    timingAllowOrigin: {
      type: "string",
      default: HEADERS_DEFAULTS.timingAllowOrigin,
      description: "Timing-Allow-Origin; empty string omits",
    },
    immutableHashedAssets: {
      type: "boolean",
      default: HEADERS_DEFAULTS.immutableHashedAssets,
      description: "Append immutable to Cache-Control for content-hashed assets",
    },
    linkPreload: {
      type: "array",
      items: { type: "string", },
      default: HEADERS_DEFAULTS.linkPreload,
      description: "Link preload hints for HTML documents",
    },
    acceptClientHints: {
      type: "array",
      items: { type: "string", },
      default: HEADERS_DEFAULTS.acceptClientHints,
      description: "Accept-CH / Critical-CH client hint tokens",
    },
    saveData: {
      type: "boolean",
      default: HEADERS_DEFAULTS.saveData,
      description: "Advertise Save-Data cooperativeness",
    },
    earlyHints: {
      type: "object",
      properties: { enabled: { type: "boolean", default: HEADERS_DEFAULTS.earlyHints.enabled, }, },
      required: ["enabled",],
    },
    reportingEndpoints: {
      type: "object",
      additionalProperties: { type: "string", },
      default: HEADERS_DEFAULTS.reportingEndpoints,
      description: "Reporting-Endpoints name → URL",
    },
    nel: { type: ["string", "null",], default: HEADERS_DEFAULTS.nel, description: "NEL policy JSON; null omits", },
    hsts: {
      type: "object",
      default: HEADERS_DEFAULTS.hsts,
      description: "Strict-Transport-Security policy (RFC 6797). Emitted only on HTTPS requests.",
      properties: {
        enabled: { type: "boolean", default: HEADERS_DEFAULTS.hsts.enabled, description: "Master toggle", },
        maxAge: {
          type: "number",
          default: HEADERS_DEFAULTS.hsts.maxAge,
          minimum: 0,
          description: "max-age in seconds; RFC 6797 recommends >= 31536000 (1 year)",
        },
        includeSubDomains: { type: "boolean", default: HEADERS_DEFAULTS.hsts.includeSubDomains, },
        preload: { type: "boolean", default: HEADERS_DEFAULTS.hsts.preload, },
      },
      required: ["enabled", "maxAge", "includeSubDomains", "preload",],
    },
  },
  required: ["enabled", "referrerPolicy", "xContentTypeOptions", "csp", "earlyHints",] as const,
};
