// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Remote actor discovery — WebFinger resolve + actor document fetch.
 *
 * A handle (`acct:alice@remote.example`) or actor URI becomes the actor
 * document in two hops: WebFinger (RFC 7033) for the actor URI, then a fetch
 * of that URI with an ActivityStreams `Accept` header.
 *
 * host-meta (RFC 6415) is OPTIONAL here. Resolvers on the older RFC 6415 flow
 * fetch `/.well-known/host-meta` first and fail when the peer publishes none
 * (404, HTML, no `lrdd` link); RFC 7033 fixed the WebFinger path, so a missing
 * host-meta only means {@link defaultWebFingerTemplate} is used. Every URL is
 * SSRF-checked with `validateFetchUrl` — host-meta is remote-controlled input
 * and can point the `lrdd` template anywhere.
 */
import { APP_VERSION, } from "../config/constants";
import { safeFetch, } from "../utils/safe-fetch";
import type { HostResolver, } from "../utils/url-validation";
import { validateFetchUrl, } from "../utils/url-validation";
import {
  isObjectLike,
  parseActorDocument,
  parseJsonObject,
  type RemoteActorDocument,
  stringField,
} from "./remote-actor-document";
import {
  ACTIVITY_JSON,
  ACTIVITY_LD_JSON,
  applyWebFingerTemplate,
  defaultWebFingerTemplate,
  extractLrddTemplate,
  HOST_META_PATH,
  parseAcctResource,
} from "./webfinger";

/** Upper bound on any single discovery response body. */
export const REMOTE_DISCOVERY_MAX_BODY = 256 * 1024;

/** Per-request timeout for host-meta, WebFinger, and actor fetches. */
export const REMOTE_DISCOVERY_TIMEOUT_MS = 5_000;

/** `Accept` header for actor documents (AS2 JSON first, then JSON-LD). */
export const ACTOR_ACCEPT = `${ACTIVITY_JSON}, ${ACTIVITY_LD_JSON}`;

/** `Accept` header for the host-meta XRD document. */
export const HOST_META_ACCEPT = "application/xrd+xml, application/xml;q=0.9";

/** Raw response returned by a discovery fetch. */
export interface RemoteFetchResponse {
  ok: boolean;
  status: number;
  body: string;
}

/** Fetch seam — injectable so tests never touch the network. */
export type RemoteFetch = (url: string, accept: string,) => Promise<RemoteFetchResponse>;

/**
 * Default fetch: bounded timeout/body, redirects refused so a peer cannot
 * bounce the request to a host the pre-flight check never saw.
 */
const defaultRemoteFetch: RemoteFetch = async (url, accept,) => {
  const result = await safeFetch<string>(url, {
    headers: { accept, "user-agent": `loop-lore/${APP_VERSION}`, },
    parseJson: false,
    redirect: "error",
    timeout: REMOTE_DISCOVERY_TIMEOUT_MS,
    maxSize: REMOTE_DISCOVERY_MAX_BODY,
  },);

  return result.ok
    ? { ok: true, status: result.status, body: result.data, }
    : { ok: false, status: result.status ?? 0, body: "", };
};

/** Why a remote actor could not be resolved. */
export type RemoteResolveFailure =
  | "invalid-resource"
  | "blocked-host"
  | "webfinger-unavailable"
  | "no-actor-link"
  | "actor-unavailable"
  | "actor-invalid";

/** Discriminated result of {@link resolveRemoteActor}. */
export type RemoteActorResolveResult =
  | { ok: true; actor: RemoteActorDocument; hostMeta: boolean }
  | { ok: false; reason: RemoteResolveFailure; detail: string };

/** Options for remote discovery. */
export interface RemoteDiscoveryOptions {
  /** Fetch seam override (tests). */
  fetchImpl?: RemoteFetch;
  /** DNS resolver seam for the SSRF check (tests). */
  resolveHost?: HostResolver;
  /** Allow loopback/private targets — dev instances only, never production. */
  allowPrivateHosts?: boolean;
}

/** Resolved WebFinger endpoint for a peer origin. */
export interface WebFingerEndpoint {
  template: string;
  /** `host-meta` when the peer published an lrdd template, else `default`. */
  source: "host-meta" | "default";
}

/**
 * Discover a peer's WebFinger endpoint, tolerating an absent host-meta — RFC 7033
 * fixes the path, so a missing host-meta only selects the default template.
 * @param opts - Origin plus fetch seam.
 */
export async function discoverWebFingerEndpoint(
  opts: RemoteDiscoveryOptions & { origin: string },
): Promise<WebFingerEndpoint> {
  const fetchImpl = opts.fetchImpl ?? defaultRemoteFetch;
  const fallback: WebFingerEndpoint = {
    template: defaultWebFingerTemplate(opts.origin,),
    source: "default",
  };

  const hostMetaUrl = `${opts.origin.replace(/\/+$/, "",)}${HOST_META_PATH}`;
  const response = await fetchImpl(hostMetaUrl, HOST_META_ACCEPT,).catch(() => null);
  if (!response?.ok) { return fallback; }
  const template = extractLrddTemplate(response.body,);
  if (!template) { return fallback; }
  return { template, source: "host-meta", };
}

/**
 * Resolve a remote actor from a handle or actor URI.
 *
 * `acct:alice@remote.example` → host-meta (optional) → WebFinger → actor
 * document. A bare `http(s)` actor URI skips the WebFinger hop. Never throws:
 * failures are reported as a reason so the caller can default-deny.
 * @param resource - Handle (`acct:user@host`) or absolute actor URI.
 * @param opts - Fetch/DNS seams and the private-host escape hatch.
 */
export async function resolveRemoteActor(
  resource: string,
  opts: RemoteDiscoveryOptions = {},
): Promise<RemoteActorResolveResult> {
  const fetchImpl = opts.fetchImpl ?? defaultRemoteFetch;

  if (/^https?:\/\//i.test(resource,)) {
    const blocked = await guardUrl(resource, opts,);
    if (blocked) { return { ok: false, reason: "blocked-host", detail: blocked, }; }
    return fetchActorDocument(resource, fetchImpl,);
  }

  const acct = parseAcctResource(resource,);
  if (!acct) {
    return {
      ok: false,
      reason: "invalid-resource",
      detail: "expected acct:user@host or an absolute http(s) actor URI",
    };
  }

  // ActivityPub mandates TLS between instances; plain-http discovery would
  // let any hop downgrade the identity being established.
  const origin = `https://${acct.host}`;
  const originBlocked = await guardUrl(origin, opts,);
  if (originBlocked) { return { ok: false, reason: "blocked-host", detail: originBlocked, }; }

  const endpoint = await discoverWebFingerEndpoint({ ...opts, origin, fetchImpl, },);
  const webfingerUrl = applyWebFingerTemplate(endpoint.template, resource,);
  // The template is peer-controlled: re-check the concrete URL it produced.
  const templateBlocked = await guardUrl(webfingerUrl, opts,);
  if (templateBlocked) { return { ok: false, reason: "blocked-host", detail: templateBlocked, }; }

  const jrd = await fetchImpl(webfingerUrl, ACTIVITY_JSON,).catch(() => null);
  if (!jrd?.ok) {
    return {
      ok: false,
      reason: "webfinger-unavailable",
      detail: `${webfingerUrl} answered ${jrd?.status ?? "no response"}`,
    };
  }

  const actorUri = pickActorUri(jrd.body,);
  if (!actorUri) {
    return { ok: false, reason: "no-actor-link", detail: "JRD carries no rel=self ActivityStreams link", };
  }

  const linkBlocked = await guardUrl(actorUri, opts,);
  if (linkBlocked) { return { ok: false, reason: "blocked-host", detail: linkBlocked, }; }

  const resolved = await fetchActorDocument(actorUri, fetchImpl,);
  return resolved.ok ? { ...resolved, hostMeta: endpoint.source === "host-meta", } : resolved;
}

/** Fetch and validate an actor document. */
async function fetchActorDocument(
  url: string,
  fetchImpl: RemoteFetch,
): Promise<RemoteActorResolveResult> {
  const response = await fetchImpl(url, ACTOR_ACCEPT,).catch(() => null);
  if (!response?.ok) {
    return {
      ok: false,
      reason: "actor-unavailable",
      detail: `${url} answered ${response?.status ?? "no response"}`,
    };
  }

  const actor = parseActorDocument(response.body,);
  if (!actor) {
    return {
      ok: false,
      reason: "actor-invalid",
      detail: `${url} is not an ActivityStreams actor document`,
    };
  }

  return { ok: true, actor, hostMeta: false, };
}

/**
 * Discovery gate: `null` when the URL is allowed, else the rejection reason.
 *
 * HTTPS is required on EVERY hop — including the peer-controlled `lrdd`
 * template and the actor URI it yields — because a plain-http hop would let
 * the peer downgrade the identity being established. `allowPrivateHosts`
 * (dev/test only) relaxes both this and the SSRF check.
 */
async function guardUrl(url: string, opts: RemoteDiscoveryOptions,): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url,);
  } catch {
    return "not an absolute URL";
  }

  if (opts.allowPrivateHosts) { return null; }
  if (parsed.protocol !== "https:") {
    return `scheme ${parsed.protocol} is not allowed (discovery requires https)`;
  }

  const verdict = await validateFetchUrl(
    url,
    opts.resolveHost ? { resolve: opts.resolveHost, } : {},
  );

  return verdict.ok ? null : verdict.error ?? "blocked";
}

/** Pick the actor document URI out of a JRD body. */
function pickActorUri(body: string,): string | null {
  const links = parseJsonObject(body,)?.links;
  if (!Array.isArray(links,)) { return null; }
  let fallback: string | null = null;
  for (const entry of links) {
    if (!isObjectLike(entry,) || entry.rel !== "self") { continue; }
    const href = stringField(entry, "href",);
    if (!href || !/^https?:\/\//i.test(href,)) { continue; }
    const type = stringField(entry, "type",);
    if (type === ACTIVITY_JSON || type === ACTIVITY_LD_JSON) { return href; }
    fallback ??= href;
  }

  return fallback;
}
