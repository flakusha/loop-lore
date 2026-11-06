// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * URL Validation — SSRF protection for provider endpoints.
 *
 * Validates URLs used for LLM/image generation providers to prevent
 * Server-Side Request Forgery (SSRF). By default allows local/private
 * IPs and localhost (the common local inference pattern). Remote URLs
 * require explicit allowlist entries.
 */
import { lookup, } from "node:dns/promises";
import { isIP, } from "node:net";

/** Link-local IPv4 range (169.254.0.0/16) — cloud metadata endpoints live here. */
const LINK_LOCAL_IPV4: { network: number; mask: number } = {
  network: 0xA9_FE_00_00,
  mask: 0xFF_FF_00_00,
};

const LOCAL_IPV4_RANGES: { network: number; mask: number }[] = [
  { network: 0x0A_00_00_00, mask: 0xFF_00_00_00, }, // 10.0.0.0/8
  { network: 0xAC_10_00_00, mask: 0xFF_F0_00_00, }, // 172.16.0.0/12
  { network: 0xC0_A8_00_00, mask: 0xFF_FF_00_00, }, // 192.168.0.0/16
  { network: 0x7F_00_00_00, mask: 0xFF_00_00_00, }, // 127.0.0.0/8
  LINK_LOCAL_IPV4, // 169.254.0.0/16 (link-local)
];

/** Exact cloud metadata endpoints that are never a legitimate provider host. */
const METADATA_HOSTS: Record<string, true> = {
  "100.100.100.200": true, // Alibaba Cloud metadata
  "fd00:ec2::254": true, // AWS IMDS over IPv6
  "metadata.google.internal": true, // Google Cloud metadata
};

/** */
export interface UrlValidationOptions {
  /** Allowed hostnames/IPs beyond local ranges (e.g. "api.openai.com") */
  allowlist?: string[];
  /** Block local/private IPs (override default allow). Default: false (local IPs allowed). */
  blockLocalAddrs?: boolean;
  /** Allowed schemes. Default: ["http", "https"] */
  allowedSchemes?: string[];
}

/** */
export interface UrlValidationResult {
  ok: boolean;
  /** Sanitized URL string (original if ok) */
  url: string;
  /** Error message if not ok */
  error?: string;
  /** Is this a local/private address? (informational) */
  local?: boolean;
}

/**
 * Validate a provider URL against SSRF rules.
 *
 * Default: allows local/private IPs + localhost, blocks remote unless in allowlist.
 * Set `blockLocalAddrs: true` to restrict to allowlist only.
 * @param urlString - raw URL from config
 * @param options - validation rules
 * @returns result with ok flag and sanitized URL
 */
export function validateProviderUrl(
  urlString: string,
  options: UrlValidationOptions = {},
): UrlValidationResult {
  const allowedSchemes = options.allowedSchemes ?? ["http", "https",];
  const allowlist = options.allowlist ?? [];
  const blockLocal = options.blockLocalAddrs ?? false;

  let parsed: URL;
  try {
    parsed = new URL(urlString,);
  } catch {
    return { ok: false, url: urlString, error: "Invalid URL: could not parse", };
  }

  if (!allowedSchemes.includes(parsed.protocol.replace(":", "",),)) {
    return {
      ok: false,
      url: urlString,
      error: `Scheme "${parsed.protocol}" not allowed. Must be one of: ${allowedSchemes.join(", ",)}`,
    };
  }

  const hostname = parsed.hostname;

  // Check allowlist first (exact match or wildcard suffix "*.example.com")
  for (const allowed of allowlist) {
    if (hostname === allowed) {
      return { ok: true, url: urlString, local: false, };
    }

    if (allowed.startsWith("*.",) && hostname.endsWith(allowed.slice(1,),)) {
      return { ok: true, url: urlString, local: false, };
    }
  }

  // Check if it's an IP address
  const ipVersion = isIP(hostname,);
  if (ipVersion) {
    const isLocal = isLocalIPv4(hostname,) || hostname === "::1" || isLocalIPv6(hostname,);

    if (isLocal) {
      if (blockLocal) {
        return {
          ok: false,
          url: urlString,
          error: `Local IP ${hostname} blocked by blockLocalAddrs option`,
          local: true,
        };
      }

      return { ok: true, url: urlString, local: true, };
    }

    // Remote IP not in allowlist
    return {
      ok: false,
      url: urlString,
      error: `Remote IP ${hostname} not in allowlist. Add to allowlist or use local address.`,
      local: false,
    };
  }

  // Hostname (not IP) — check against localhost
  if (hostname === "localhost" || hostname.endsWith(".local",)) {
    if (blockLocal) {
      return {
        ok: false,
        url: urlString,
        error: `Local hostname "${hostname}" blocked by blockLocalAddrs option`,
        local: true,
      };
    }

    return { ok: true, url: urlString, local: true, };
  }

  // Remote hostname not in allowlist
  return {
    ok: false,
    url: urlString,
    error: `Remote host "${hostname}" not in allowlist. Add to allowlist for remote providers.`,
    local: false,
  };
}

/**
 * Validate multiple provider URLs at once.
 * @param entries - array of { name, url } pairs to validate
 * @param options - shared validation options
 * @returns map of name → result
 */
export function validateProviderUrls(
  entries: { name: string; url: string }[],
  options: UrlValidationOptions = {},
): Record<string, UrlValidationResult> {
  const results: Record<string, UrlValidationResult> = {};
  for (const { name, url, } of entries) {
    results[name] = validateProviderUrl(url, options,);
  }

  return results;
}

/**
 * @param ip - IPv4 string to classify
 * @returns `true` if `ip` lies in a local/private IPv4 range (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16); `false` otherwise.
 */
function isLocalIPv4(ip: string,): boolean {
  return LOCAL_IPV4_RANGES.some((range,) => inIPv4Range(ip, range,));
}

/**
 * @param ip - IPv4 string to classify
 * @param range - network/mask pair
 * @returns `true` when the address lies inside the range
 */
function inIPv4Range(ip: string, range: { network: number; mask: number },): boolean {
  const parts = ip.split(".",);
  if (parts.length !== 4) { return false; }

  const a = parseInt(parts[0]!, 10,);
  const b = parseInt(parts[1]!, 10,);
  const c = parseInt(parts[2]!, 10,);
  const d = parseInt(parts[3]!, 10,);
  if (isNaN(a,) || isNaN(b,) || isNaN(c,) || isNaN(d,)) { return false; }

  // Use unsigned arithmetic to avoid sign extension issues
  const addr = (a * 16_777_216) + (b * 65_536) + (c * 256) + d;
  return ((addr & range.mask) >>> 0) === range.network;
}

/**
 * @param ip - IPv6 string to classify
 * @returns `true` if `ip` is loopback (`::1`), unspecified (`::`), link-local
 * (`fe80::/10`) or unique-local (`fc00::/7`); `false` otherwise.
 */
function isLocalIPv6(ip: string,): boolean {
  const lower = stripBrackets(ip,).toLowerCase();
  if (lower === "::1" || lower === "::") { return true; }

  const embedded = embeddedIPv4(lower,);
  if (embedded) { return isLocalIPv4(embedded,); }

  // fe80::/10 spans fe80-febf; fc00::/7 spans fc00-fdff (compare the first hextet).
  const bits = firstHextet(lower,);
  if (bits === null) { return false; }
  return (bits >= 0xfe80 && bits <= 0xfebf) || (bits >= 0xfc00 && bits <= 0xfdff);
}

/**
 * @param host - a host string that may carry IPv6 brackets
 * @returns the host without its brackets
 */
function stripBrackets(host: string,): string {
  return host.startsWith("[",) && host.endsWith("]",) ? host.slice(1, -1,) : host;
}

/**
 * The IPv4 address embedded in an IPv4-mapped/compatible IPv6 literal, if any.
 * @param ip - IPv6 literal
 * @returns the dotted-quad address, or undefined when the literal carries none
 */
function embeddedIPv4(ip: string,): string | undefined {
  const lower = stripBrackets(ip,).toLowerCase();
  if (!lower.startsWith("::",)) { return undefined; }

  // IPv4-mapped and IPv4-compatible forms embed a v4 address, in either the
  // dotted form (::ffff:10.0.0.1) or the hex form URL parsing produces
  // (::ffff:a00:1). The v4 address is the last two hextets in the hex form.
  const rest = lower.slice(2,);
  const tail = rest.startsWith("ffff:",) ? rest.slice(5,) : rest;
  if (tail.includes(".",)) { return tail; }

  const hextets = tail.split(":",);
  if (hextets.length !== 2) { return undefined; }
  const high = parseInt(hextets[0]!, 16,);
  const low = parseInt(hextets[1]!, 16,);
  if (Number.isNaN(high,) || Number.isNaN(low,)) { return undefined; }
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/**
 * @param ip - IPv6 literal
 * @returns the value of the first hextet, or null when it is not a hex group
 */
function firstHextet(ip: string,): number | null {
  const first = (ip.split(":",)[0] ?? "").padStart(4, "0",).slice(0, 4,);
  const bits = parseInt(first || "0", 16,);
  return Number.isNaN(bits,) ? null : bits;
}

/**
 * Whether a hostname is a link-local or cloud-metadata target.
 *
 * These addresses are never a legitimate provider endpoint: they answer with
 * the host's own credentials. Loopback and RFC1918 ranges are NOT covered —
 * local inference servers (Ollama, LM Studio) are the common case.
 * @param hostname - the host part of a URL (IPv6 brackets optional)
 * @returns `true` for the link-local ranges and the known metadata endpoints
 */
export function isMetadataTarget(hostname: string,): boolean {
  const host = stripBrackets(hostname.trim().toLowerCase(),);
  if (!host) { return false; }
  if (METADATA_HOSTS[host] === true) { return true; }

  const embedded = embeddedIPv4(host,);
  if (embedded) { return inIPv4Range(embedded, LINK_LOCAL_IPV4,); }
  if (isIP(host,) === 4) { return inIPv4Range(host, LINK_LOCAL_IPV4,); }

  // fe80::/10 spans fe80-febf.
  const bits = firstHextet(host,);
  return bits !== null && bits >= 0xfe80 && bits <= 0xfebf;
}

/**
 * Resolve a hostname to every address it maps to (A + AAAA).
 * Injected in tests so no network access is required.
 */
export type HostResolver = (hostname: string,) => Promise<string[]>;

/** */
export interface FetchUrlOptions {
  /** DNS resolver seam. Defaults to node:dns `lookup` with `all: true`. */
  resolve?: HostResolver;
}

const defaultResolve: HostResolver = async (hostname: string,) => {
  const records = await lookup(hostname, { all: true, verbatim: true, },);
  return records.map((r,) => r.address);
};

/**
 * Validate a user-supplied URL before the server fetches it.
 *
 * This is the inverse of {@link validateProviderUrl}: local and private
 * addresses are BLOCKED and public ones allowed. The hostname's DNS records are
 * resolved first, so a public hostname pointing at a private address cannot
 * smuggle a request past a string test on the hostname. Failures fail closed.
 * @param urlString - raw URL from the request
 * @param options - resolver seam
 * @returns result with ok flag; on failure `error` explains why
 */
export async function validateFetchUrl(
  urlString: string,
  options: FetchUrlOptions = {},
): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlString,);
  } catch {
    return { ok: false, url: urlString, error: "Invalid URL", };
  }

  const scheme = parsed.protocol.replace(":", "",);
  if (scheme !== "http" && scheme !== "https") {
    return { ok: false, url: urlString, error: `Scheme ${scheme} not allowed`, };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "",);
  const reject = (error: string, local: boolean,): UrlValidationResult => ({
    ok: false,
    url: urlString,
    error,
    local,
  });

  // A literal address needs no resolution.
  if (isIP(hostname,)) {
    return isLocalIPv4(hostname,) || isLocalIPv6(hostname,)
      ? reject(`Address ${hostname} is private or restricted`, true,)
      : { ok: true, url: urlString, local: false, };
  }

  const resolve = options.resolve ?? defaultResolve;
  let addresses: string[];
  try {
    addresses = await resolve(hostname,);
  } catch (error: unknown) {
    const why = error instanceof Error ? error.message : String(error,);
    return reject(`Could not resolve host: ${why}`, false,);
  }

  if (addresses.length === 0) { return reject("Host resolved to no addresses", false,); }

  for (const address of addresses) {
    const bare = address.replace(/^\[|\]$/g, "",);
    if (isIP(bare,) && (isLocalIPv4(bare,) || isLocalIPv6(bare,))) {
      return reject(`Host resolves to the private address ${bare}`, true,);
    }
  }

  return { ok: true, url: urlString, local: false, };
}
