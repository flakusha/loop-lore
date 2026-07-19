/**
 * URL Validation — SSRF protection for provider endpoints.
 *
 * Validates URLs used for LLM/image generation providers to prevent
 * Server-Side Request Forgery (SSRF). By default allows local/private
 * IPs and localhost (the common local inference pattern). Remote URLs
 * require explicit allowlist entries.
 */
import { isIP } from "node:net";

const LOCAL_IPV4_RANGES: { network: number; mask: number }[] = [
  { network: 0x0A_00_00_00, mask: 0xFF_00_00_00 }, // 10.0.0.0/8
  { network: 0xAC_10_00_00, mask: 0xFF_F0_00_00 }, // 172.16.0.0/12
  { network: 0xC0_A8_00_00, mask: 0xFF_FF_00_00 }, // 192.168.0.0/16
  { network: 0x7F_00_00_00, mask: 0xFF_00_00_00 }, // 127.0.0.0/8
  { network: 0xA9_FE_00_00, mask: 0xFF_FF_00_00 }, // 169.254.0.0/16 (link-local)
];

export interface UrlValidationOptions {
  /** Allowed hostnames/IPs beyond local ranges (e.g. "api.openai.com") */
  allowlist?: string[];
  /** Block local/private IPs (override default allow). Default: false (local IPs allowed). */
  blockLocalAddrs?: boolean;
  /** Allowed schemes. Default: ["http", "https"] */
  allowedSchemes?: string[];
}

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
 *
 * @param urlString - raw URL from config
 * @param options - validation rules
 * @returns result with ok flag and sanitized URL
 */
export function validateProviderUrl(
  urlString: string,
  options: UrlValidationOptions = {},
): UrlValidationResult {
  const allowedSchemes = options.allowedSchemes ?? ["http", "https"];
  const allowlist = options.allowlist ?? [];
  const blockLocal = options.blockLocalAddrs ?? false;

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { ok: false, url: urlString, error: "Invalid URL: could not parse" };
  }

  if (!allowedSchemes.includes(parsed.protocol.replace(":", ""))) {
    return {
      ok: false,
      url: urlString,
      error: `Scheme "${parsed.protocol}" not allowed. Must be one of: ${allowedSchemes.join(", ")}`,
    };
  }

  const hostname = parsed.hostname;

  // Check allowlist first (exact match or wildcard suffix "*.example.com")
  for (const allowed of allowlist) {
    if (hostname === allowed) {
      return { ok: true, url: urlString, local: false };
    }
    if (allowed.startsWith("*.") && hostname.endsWith(allowed.slice(1))) {
      return { ok: true, url: urlString, local: false };
    }
  }

  // Check if it's an IP address
  const ipVersion = isIP(hostname);
  if (ipVersion) {
    const isLocal = isLocalIPv4(hostname) || hostname === "::1" || isLocalIPv6(hostname);

    if (isLocal) {
      if (blockLocal) {
        return {
          ok: false,
          url: urlString,
          error: `Local IP ${hostname} blocked by blockLocalAddrs option`,
          local: true,
        };
      }
      return { ok: true, url: urlString, local: true };
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
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    if (blockLocal) {
      return {
        ok: false,
        url: urlString,
        error: `Local hostname "${hostname}" blocked by blockLocalAddrs option`,
        local: true,
      };
    }
    return { ok: true, url: urlString, local: true };
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
 *
 * @param entries - array of { name, url } pairs to validate
 * @param options - shared validation options
 * @returns map of name → result
 */
export function validateProviderUrls(
  entries: { name: string; url: string }[],
  options: UrlValidationOptions = {},
): Record<string, UrlValidationResult> {
  const results: Record<string, UrlValidationResult> = {};
  for (const { name, url } of entries) {
    results[name] = validateProviderUrl(url, options);
  }
  return results;
}

function isLocalIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  const a = parseInt(parts[0]!, 10);
  const b = parseInt(parts[1]!, 10);
  const c = parseInt(parts[2]!, 10);
  const d = parseInt(parts[3]!, 10);
  if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d)) return false;

  const addr = (a << 24) | (b << 16) | (c << 8) | d;

  for (const range of LOCAL_IPV4_RANGES) {
    if ((addr & range.mask) === range.network) return true;
  }
  return false;
}

function isLocalIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fe80:");
}
