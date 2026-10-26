// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ActivityStreams actor-document narrowing for remote discovery.
 *
 * A remote actor document is untrusted JSON fetched from an arbitrary host.
 * Everything the resolver consumers rely on (identity, inbox, signing key) is
 * extracted here through explicit type guards — no casting, no `any`, and a
 * document that does not carry an absolute `id`, a known actor `type`, and an
 * absolute `inbox` is rejected outright rather than partially trusted.
 */
import { safeJsonParse, } from "../utils";

/** Public key advertised by an actor document, if any. */
export interface RemoteActorKey {
  id: string | null;
  owner: string | null;
  /** PEM form (`publicKeyPem`). */
  pem: string | null;
  /** JWK form (`publicKeyJwk`), when the peer publishes one. */
  jwk: Record<string, unknown> | null;
}

/** The subset of an ActivityStreams actor document this server consumes. */
export interface RemoteActorDocument {
  /** Actor URI (`id`). */
  id: string;
  /** Actor type, e.g. `Person`. */
  type: string;
  preferredUsername: string | null;
  name: string | null;
  /** Inbox URI — required to deliver an inbound follow. */
  inbox: string;
  outbox: string | null;
  followers: string | null;
  /** HTML profile page, when advertised. */
  url: string | null;
  publicKey: RemoteActorKey | null;
}

/** Actor types accepted as an ActivityPub actor document. */
const ACTOR_TYPES = new Set([
  "person",
  "service",
  "application",
  "group",
  "organization",
  "actor",
],);

/**
 * Validate and narrow an actor document body.
 * @param body - Raw JSON response text.
 * @returns The narrowed document, or null when it is not a usable actor.
 */
export function parseActorDocument(body: string,): RemoteActorDocument | null {
  const doc = parseJsonObject(body,);
  if (!doc) { return null; }
  const id = stringField(doc, "id",);
  const type = Array.isArray(doc.type,)
    ? doc.type.find((candidate,): candidate is string => typeof candidate === "string")
    : stringField(doc, "type",);

  const inbox = stringField(doc, "inbox",);
  if (!id || !/^https?:\/\//i.test(id,)) { return null; }
  if (!type || !ACTOR_TYPES.has(type.toLowerCase(),)) { return null; }
  if (!inbox || !/^https?:\/\//i.test(inbox,)) { return null; }
  return {
    id,
    type,
    preferredUsername: stringField(doc, "preferredUsername",),
    name: stringField(doc, "name",),
    inbox,
    outbox: httpField(doc, "outbox",),
    followers: httpField(doc, "followers",),
    url: actorUrl(doc,),
    publicKey: parsePublicKey(doc.publicKey,),
  };
}

/** Parse a JSON object body, returning null on any parse/shape failure. */
export function parseJsonObject(body: string,): Record<string, unknown> | null {
  const parsed = safeJsonParse<unknown>(body,);
  return parsed.ok && isObjectLike(parsed.value,) ? parsed.value : null;
}

/** `outbox`/`followers` must be absolute http(s) URLs when present. */
function httpField(doc: Record<string, unknown>, key: string,): string | null {
  const value = stringField(doc, key,);
  return value && /^https?:\/\//i.test(value,) ? value : null;
}

/** Human profile page: `url` may be a string or an array of link objects. */
function actorUrl(doc: Record<string, unknown>,): string | null {
  const direct = httpField(doc, "url",);
  if (direct) { return direct; }
  if (!Array.isArray(doc.url,)) { return null; }
  for (const entry of doc.url) {
    if (typeof entry === "string" && /^https?:\/\//i.test(entry,)) { return entry; }
    if (isObjectLike(entry,)) {
      const href = stringField(entry, "href",);
      if (href && /^https?:\/\//i.test(href,)) { return href; }
    }
  }

  return null;
}

/** Narrow the `publicKey` object, keeping PEM and JWK forms. */
function parsePublicKey(value: unknown,): RemoteActorKey | null {
  if (!isObjectLike(value,)) { return null; }
  return {
    id: stringField(value, "id",),
    owner: stringField(value, "owner",),
    pem: stringField(value, "publicKeyPem",),
    jwk: isObjectLike(value.publicKeyJwk,) ? value.publicKeyJwk : null,
  };
}

/** True for non-null, non-array objects. */
export function isObjectLike(value: unknown,): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value,);
}

/** Read a non-empty string field. */
export function stringField(obj: Record<string, unknown>, key: string,): string | null {
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
