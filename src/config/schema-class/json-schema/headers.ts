// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/headers.ts — headers JSON Schema section
export const headers = {
  type: "object",
  description: "Response-header policy (browser security / isolation / perf / observability)",
  properties: {
    enabled: { type: "boolean", default: true, description: "Master toggle for header injection", },
    referrerPolicy: {
      type: "string",
      default: "strict-origin-when-cross-origin",
      description: "Referrer-Policy value",
    },
    xContentTypeOptions: {
      type: "boolean",
      default: true,
      description: "Emit X-Content-Type-Options: nosniff",
    },
    xFrameOptions: {
      type: ["string", "null",],
      enum: ["DENY", "SAMEORIGIN", null,],
      default: "DENY",
      description: "X-Frame-Options; null omits",
    },
    permissionsPolicy: {
      type: "string",
      default: "accelerometer=(), camera=(), geolocation=(), microphone=(), usb=()",
      description: "Permissions-Policy feature delegation",
    },
    csp: {
      type: "object",
      description: "Content-Security-Policy directive set (HTML only)",
      properties: {
        enabled: { type: "boolean", default: true, },
        defaultSrc: { type: "array", items: { type: "string", }, default: ["'self'",], },
        scriptSrc: {
          type: "array",
          items: { type: "string", },
          default: ["'self'", "'unsafe-inline'", "'unsafe-eval'",],
        },
        styleSrc: {
          type: "array",
          items: { type: "string", },
          default: ["'self'", "'unsafe-inline'",],
        },
        imgSrc: { type: "array", items: { type: "string", }, default: ["'self'", "data:", "blob:",], },
        fontSrc: { type: "array", items: { type: "string", }, default: ["'self'",], },
        connectSrc: {
          type: "array",
          items: { type: "string", },
          default: ["'self'", "wss:", "https:",],
        },
        objectSrc: { type: "array", items: { type: "string", }, default: ["'none'",], },
        baseUri: { type: "array", items: { type: "string", }, default: ["'self'",], },
        frameAncestors: { type: "array", items: { type: "string", }, default: ["'none'",], },
        formAction: { type: "array", items: { type: "string", }, default: ["'self'",], },
        upgradeInsecureRequests: { type: "boolean", default: true, },
        reportOnly: {
          type: "boolean",
          default: false,
          description: "Emit CSP as Report-Only (observe, not enforce)",
        },
      },
      required: ["enabled",],
    },
    crossOriginOpenerPolicy: {
      type: ["string", "null",],
      enum: ["same-origin", "same-origin-allow-popups", null,],
      default: null,
      description: "COOP; null omits",
    },
    crossOriginEmbedderPolicy: {
      type: ["string", "null",],
      enum: ["require-corp", null,],
      default: null,
      description: "COEP; self-hosted Alpine/htmx resolved CDN blocker. Still not needed (no wasm/SAB).",
    },
    crossOriginResourcePolicy: {
      type: ["string", "null",],
      enum: ["same-origin", "cross-origin", null,],
      default: "cross-origin",
      description: "CORP for static subresources",
    },
    timingAllowOrigin: {
      type: "string",
      default: "",
      description: "Timing-Allow-Origin; empty string omits",
    },
    immutableHashedAssets: {
      type: "boolean",
      default: true,
      description: "Append immutable to Cache-Control for content-hashed assets",
    },
    linkPreload: {
      type: "array",
      items: { type: "string", },
      default: ["/alpine-init.js", "/css/app.css",],
      description: "Link preload hints for HTML documents",
    },
    acceptClientHints: {
      type: "array",
      items: { type: "string", },
      default: [],
      description: "Accept-CH / Critical-CH client hint tokens",
    },
    saveData: { type: "boolean", default: false, description: "Advertise Save-Data cooperativeness", },
    earlyHints: {
      type: "object",
      properties: { enabled: { type: "boolean", default: false, }, },
      required: ["enabled",],
    },
    reportingEndpoints: {
      type: "object",
      additionalProperties: { type: "string", },
      default: {},
      description: "Reporting-Endpoints name → URL",
    },
    nel: { type: ["string", "null",], default: null, description: "NEL policy JSON; null omits", },
    hsts: {
      type: "object",
      default: { enabled: false, maxAge: 31536000, includeSubDomains: true, preload: false, },
      description: "Strict-Transport-Security policy (RFC 6797). Emitted only on HTTPS requests.",
      properties: {
        enabled: { type: "boolean", default: false, description: "Master toggle", },
        maxAge: { type: "number", default: 31536000, minimum: 0, description: "max-age in seconds; RFC 6797 recommends >= 31536000 (1 year)", },
        includeSubDomains: { type: "boolean", default: true, },
        preload: { type: "boolean", default: false, },
      },
      required: ["enabled", "maxAge", "includeSubDomains", "preload",],
    },
  },
  required: ["enabled", "referrerPolicy", "xContentTypeOptions", "csp", "earlyHints",],
 };
