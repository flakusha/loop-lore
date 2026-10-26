// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * WebFinger (RFC 7033) + host-meta (RFC 6415) primitives.
 *
 * Publication side: this instance advertises `/.well-known/host-meta` with an
 * `lrdd` link template and answers `/.well-known/webfinger` for characters
 * whose owner opted into federation (`characters.federation_consent`).
 *
 * Resolution side (consumed by `src/federation/remote-actor.ts`): RFC 7033
 * made `/.well-known/webfinger` the REQUIRED location and demoted host-meta to
 * informational. A resolver that requires a host-meta `lrdd` template breaks
 * against every instance that does not publish one, so
 * {@link defaultWebFingerTemplate} is always the fallback.
 */

/** Absolute path of the RFC 6415 host-meta document. */
export const HOST_META_PATH = "/.well-known/host-meta";

/** Absolute path of the RFC 7033 WebFinger endpoint. */
export const WEBFINGER_PATH = "/.well-known/webfinger";

/** ActivityStreams 2.0 media type for actor documents. */
export const ACTIVITY_JSON = "application/activity+json";

/** JSON-LD ActivityStreams profile media type. */
export const ACTIVITY_LD_JSON = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';

/** Parsed `acct:` URI (RFC 7565). */
export interface AcctResource {
  /** Local part before `@`, e.g. `alice`. */
  user: string;
  /** Domain part after `@`, e.g. `lore.example.com`. */
  host: string;
}

/** A single JRD link entry. */
export interface JrdLink {
  rel: string;
  type?: string;
  href?: string;
}

/** JSON Resource Descriptor body returned by a WebFinger endpoint. */
export interface JrdBody {
  subject: string;
  aliases?: string[];
  links: JrdLink[];
}

/**
 * Parse an `acct:user@host` WebFinger resource.
 *
 * Rejects anything that is not an `acct:` URI with a non-empty user and host,
 * so a caller can treat `null` as "not a handle" instead of guessing.
 * @param resource - Raw `resource` query value.
 * @returns Parsed parts, or null when the value is not an acct URI.
 */
export function parseAcctResource(resource: string,): AcctResource | null {
  if (!resource.toLowerCase().startsWith("acct:",)) { return null; }
  const body = resource.slice("acct:".length,);
  const at = body.lastIndexOf("@",);
  if (at <= 0 || at === body.length - 1) { return null; }
  const user = body.slice(0, at,);
  const host = body.slice(at + 1,);
  if (user.length === 0 || host.length === 0) { return null; }
  if (/\s/.test(user,) || /\s|[/?#]/.test(host,)) { return null; }
  return { user, host, };
}

/**
 * Build the canonical `acct:` subject for a handle.
 * @param user - Local part.
 * @param host - Domain part.
 */
export function acctSubject(user: string, host: string,): string {
  return `acct:${user}@${host}`;
}

/** Escape a value for inclusion in XML text or an attribute. */
function escapeXml(value: string,): string {
  return value
    .replace(/&/g, "&amp;",)
    .replace(/</g, "&lt;",)
    .replace(/>/g, "&gt;",)
    .replace(/"/g, "&quot;",)
    .replace(/'/g, "&apos;",);
}

/** Decode the five XML entities this module may encounter. */
function decodeXml(value: string,): string {
  return value
    .replace(/&lt;/g, "<",)
    .replace(/&gt;/g, ">",)
    .replace(/&quot;/g, '"',)
    .replace(/&apos;/g, "'",)
    .replace(/&amp;/g, "&",);
}

/**
 * RFC 7033 default WebFinger URL for an origin — used whenever a peer
 * publishes no usable host-meta `lrdd` template.
 * @param origin - Scheme + host of the peer, e.g. `https://lore.example`.
 */
export function defaultWebFingerTemplate(origin: string,): string {
  return `${origin.replace(/\/+$/, "",)}${WEBFINGER_PATH}?resource={uri}`;
}

/**
 * Render the host-meta XRD document advertising this instance's WebFinger
 * endpoint. Contains no actors and no counts — it is a protocol pointer only.
 * @param origin - Public origin of this instance.
 */
export function buildHostMetaXrd(origin: string,): string {
  const template = escapeXml(defaultWebFingerTemplate(origin,),);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">',
    `  <Link rel="lrdd" template="${template}"/>`,
    "</XRD>",
    "",
  ].join("\n",);
}

/**
 * Read one XML attribute value, tolerating either quote style. Anchored to a
 * leading space or the tag start so `data-rel="…"` never satisfies `rel`.
 * @param tag - Raw element text.
 * @param name - Attribute name.
 */
function attribute(tag: string, name: string,): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i",).exec(tag,);
  if (!match) { return null; }
  return match[2] ?? match[3] ?? null;
}

/**
 * Extract the `lrdd` link template from a host-meta XRD document.
 *
 * Tolerant by design: attribute order is arbitrary, the element may be
 * `<Link>` or `<link>`, single or double quotes are both legal. A peer that
 * publishes no template (or a document this parser cannot read) yields `null`
 * so the caller falls back to {@link defaultWebFingerTemplate}.
 * @param xml - Raw host-meta response body.
 * @returns The decoded template, or null when absent.
 */
export function extractLrddTemplate(xml: string,): string | null {
  for (const tag of xml.match(/<link\b[^>]*>/gi,) ?? []) {
    const rel = attribute(tag, "rel",);
    if (rel?.toLowerCase() !== "lrdd") { continue; }
    const template = attribute(tag, "template",);
    if (template) { return decodeXml(template,); }
  }

  return null;
}

/**
 * Build the JRD body this instance returns for a local character.
 * @param subject - `acct:` subject of the actor.
 * @param actorUri - Absolute actor document URI.
 */
export function buildActorJrd(subject: string, actorUri: string,): JrdBody {
  return {
    subject,
    aliases: [actorUri,],
    links: [{ rel: "self", type: ACTIVITY_JSON, href: actorUri, },],
  };
}

/**
 * Substitute a `{uri}` WebFinger template, or append the resource parameter
 * when the peer published a template without the placeholder.
 * @param template - Template from host-meta or {@link defaultWebFingerTemplate}.
 * @param resource - Raw resource value to encode.
 */
export function applyWebFingerTemplate(template: string, resource: string,): string {
  const encoded = encodeURIComponent(resource,);
  if (template.includes("{uri}",)) { return template.replace(/\{uri\}/g, encoded,); }
  const separator = template.includes("?",) ? "&" : "?";
  return `${template}${separator}resource=${encoded}`;
}
