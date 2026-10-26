// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Local half of WebFinger: which of THIS instance's characters answer for a
 * `resource` value.
 *
 * Publication is gated by `characters.federation_consent` — the same consent
 * the ActivityPub key service enforces before minting a signing keypair — so a
 * character whose owner never opted into federation is indistinguishable from
 * one that does not exist. Handles are derived from the character name through
 * the existing `slugifyName`; an ambiguous slug answers nothing rather than
 * guessing which character the caller meant.
 */
import type { Kysely, } from "kysely";
import { slugifyName, } from "../characters/seed/identity";
import type { DB, } from "../db/schema";
import type { JrdBody, } from "./webfinger";
import { acctSubject, buildActorJrd, parseAcctResource, } from "./webfinger";

/** A character that answered a WebFinger resource lookup. */
export interface LocalActorMatch {
  /** `acct:slug@host` subject. */
  subject: string;
  /** Absolute actor document URI. */
  actorUri: string;
  /** JRD body ready to send. */
  jrd: JrdBody;
}

/** Options for {@link resolveLocalActor}. */
export interface ResolveLocalActorOptions {
  database: Kysely<DB>;
  /** Public origin of this instance, e.g. `https://lore.example`. */
  origin: string;
  /** Raw `resource` query value. */
  resource: string;
}

/** Path prefix of local actor documents advertised in JRD `self` links. */
export const LOCAL_ACTOR_PATH = "/users";

/**
 * Resolve a local character from an `acct:` handle or from this instance's
 * actor URI. Foreign hosts always miss: an instance never vouches for a
 * handle it does not own.
 * @param opts - Database, origin, and the raw resource value.
 * @returns The match, or null when the resource does not name a published
 *   character of this instance.
 */
export async function resolveLocalActor(
  opts: ResolveLocalActorOptions,
): Promise<LocalActorMatch | null> {
  const hostname = originHostname(opts.origin,);
  if (!hostname) { return null; }

  const wanted = wantedCharacter(opts.resource, opts.origin, hostname,);
  if (!wanted) { return null; }

  const published = await opts.database
    .selectFrom("characters",)
    .select(["id", "name",],)
    .where("federation_consent", "=", 1,)
    .execute();

  const matches = wanted.byId
    ? published.filter((row,) => row.id === wanted.byId)
    : published.filter((row,) => slugifyName(row.name,) === wanted.slug);

  // Zero matches: unknown or unpublished. Several matches: the slug is shared,
  // and picking one would disclose an account the caller did not name.
  if (matches.length !== 1) { return null; }

  const character = matches[0];
  if (!character) { return null; }
  const slug = slugifyName(character.name,);
  if (slug.length === 0) { return null; }
  const subject = acctSubject(slug, hostname,);
  const actorUri = `${stripTrailingSlash(opts.origin,)}${LOCAL_ACTOR_PATH}/${encodeURIComponent(character.id,)}`;
  return { subject, actorUri, jrd: buildActorJrd(subject, actorUri,), };
}

/** What the resource asks for: a character id or a handle slug. */
type WantedCharacter =
  | { byId: string; slug: null }
  | { byId: null; slug: string };

/** Translate a resource value into a lookup, or null when it is not ours. */
function wantedCharacter(
  resource: string,
  origin: string,
  hostname: string,
): WantedCharacter | null {
  const acct = parseAcctResource(resource,);
  if (!acct) { return wantedByActorUri(resource, origin, hostname,); }
  if (acct.host.toLowerCase() !== hostname) { return null; }
  const slug = acct.user.toLowerCase();
  return slug.length === 0 ? null : { byId: null, slug, };
}

/** Actor-URI form of a resource: `<origin>/users/<characterId>`. */
function wantedByActorUri(
  resource: string,
  origin: string,
  hostname: string,
): WantedCharacter | null {
  let parsed: URL;
  try {
    parsed = new URL(resource,);
  } catch {
    return null;
  }

  if (parsed.hostname.toLowerCase() !== hostname) { return null; }
  if (parsed.origin !== new URL(origin,).origin) { return null; }
  const prefix = `${LOCAL_ACTOR_PATH}/`;
  if (!parsed.pathname.startsWith(prefix,)) { return null; }
  const raw = parsed.pathname.slice(prefix.length,);
  if (raw.length === 0 || raw.includes("/",)) { return null; }
  // `decodeURIComponent` throws on malformed escapes (`/users/%ZZ`). This is an
  // unauthenticated route, so a bad URI must be a miss, not a 500.
  try {
    return { byId: decodeURIComponent(raw,), slug: null, };
  } catch {
    return null;
  }
}

/** Lowercased hostname of a configured origin, or null when unparsable. */
function originHostname(origin: string,): string | null {
  try {
    return new URL(origin,).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Origin without trailing slashes (actor URIs join a path onto it). */
function stripTrailingSlash(origin: string,): string {
  return origin.replace(/\/+$/, "",);
}
