// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/headers.ts — Headers config section

import type { CspConfig, HeadersConfig, } from "../schema";

export const CSP_DEFAULTS: CspConfig = {
  enabled: true,
  defaultSrc: ["'self'",],
  scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'",],
  styleSrc: ["'self'", "'unsafe-inline'",],
  imgSrc: ["'self'", "data:", "blob:",],
  fontSrc: ["'self'",],
  connectSrc: ["'self'", "wss:", "https:",],
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
  crossOriginOpenerPolicy: null,
  crossOriginEmbedderPolicy: null,
  crossOriginResourcePolicy: "cross-origin" as const,
  timingAllowOrigin: "",
  immutableHashedAssets: true,
  linkPreload: ["/alpine-init.js", "/css/app.css",],
  acceptClientHints: [],
  saveData: false,
  earlyHints: { enabled: false, },
  reportingEndpoints: {},
  nel: null,
};

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
  linkPreload = [...HEADERS_DEFAULTS.linkPreload,];
  acceptClientHints = [...HEADERS_DEFAULTS.acceptClientHints,];
  saveData = HEADERS_DEFAULTS.saveData;
  earlyHints = { ...HEADERS_DEFAULTS.earlyHints, };
  reportingEndpoints: Record<string, string> = {};
  nel = HEADERS_DEFAULTS.nel;

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
    enabled: {
      type: "boolean",
      description: "Master toggle for header injection",
    },
    referrerPolicy: {
      type: "string",
      description: "Referrer-Policy value",
    },
    xContentTypeOptions: {
      type: "boolean",
      description: "Emit X-Content-Type-Options: nosniff",
    },
    xFrameOptions: {
      type: ["string", "null",],
      enum: ["DENY", "SAMEORIGIN", null,],
      description: "X-Frame-Options; null omits",
    },
    permissionsPolicy: {
      type: "string",
      description: "Permissions-Policy feature delegation",
    },
    csp: {
      type: "object",
      description: "Content-Security-Policy directive set (HTML only)",
      properties: {
        enabled: { type: "boolean", },
        defaultSrc: { type: "array", items: { type: "string", }, },
        scriptSrc: { type: "array", items: { type: "string", }, },
        styleSrc: { type: "array", items: { type: "string", }, },
        imgSrc: { type: "array", items: { type: "string", }, },
        fontSrc: { type: "array", items: { type: "string", }, },
        connectSrc: { type: "array", items: { type: "string", }, },
        objectSrc: { type: "array", items: { type: "string", }, },
        baseUri: { type: "array", items: { type: "string", }, },
        frameAncestors: { type: "array", items: { type: "string", }, },
        formAction: { type: "array", items: { type: "string", }, },
        upgradeInsecureRequests: { type: "boolean", },
        reportOnly: {
          type: "boolean",
          description: "Emit CSP as Report-Only (observe, not enforce)",
        },
      },
      required: ["enabled",],
    },
    crossOriginOpenerPolicy: {
      type: ["string", "null",],
      enum: ["same-origin", "same-origin-allow-popups", null,],
      description: "COOP; null omits",
    },
    crossOriginEmbedderPolicy: {
      type: ["string", "null",],
      enum: ["require-corp", null,],
      description: "COEP; self-hosted Alpine/htmx resolved CDN blocker. Still not needed (no wasm/SAB).",
    },
    crossOriginResourcePolicy: {
      type: ["string", "null",],
      enum: ["same-origin", "cross-origin", null,],
      description: "CORP for static subresources",
    },
    timingAllowOrigin: {
      type: "string",
      description: "Timing-Allow-Origin; empty string omits",
    },
    immutableHashedAssets: {
      type: "boolean",
      description: "Append immutable to Cache-Control for content-hashed assets",
    },
    linkPreload: {
      type: "array",
      items: { type: "string", },
      description: "Link preload hints for HTML documents",
    },
    acceptClientHints: {
      type: "array",
      items: { type: "string", },
      description: "Accept-CH / Critical-CH client hint tokens",
    },
    saveData: {
      type: "boolean",
      description: "Advertise Save-Data cooperativeness",
    },
    earlyHints: {
      type: "object",
      properties: { enabled: { type: "boolean", }, },
      required: ["enabled",],
    },
    reportingEndpoints: {
      type: "object",
      additionalProperties: { type: "string", },
      description: "Reporting-Endpoints name → URL",
    },
    nel: {
      type: ["string", "null",],
      description: "NEL policy JSON; null omits",
    },
  },
  required: ["enabled", "referrerPolicy", "xContentTypeOptions", "csp", "earlyHints",] as const,
};
