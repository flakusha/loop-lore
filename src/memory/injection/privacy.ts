/**
 * Injection privacy — extended level mapping and hard-block checks.
 */
import type { MemoryPrivacy, } from "../types";
import type { InjectionContext, InjectionPrivacyLevel, } from "./types";

/** Map extended privacy to base privacy for provision pipeline. */
export function toBasePrivacy(level: InjectionPrivacyLevel,): MemoryPrivacy {
  switch (level) {
    case "absolute":
    case "isolated":
    case "private": {
      return "private";
    }
    case "localized":
    case "contextual":
    case "shared": {
      return "shared";
    }
    case "public": {
      return "public";
    }
    case "secret": {
      return "secret";
    }
  }
}

/**
 * Check injection privacy — hard blocks based on level and context.
 * Returns rejection reason, or null if allowed.
 */
export function checkInjectionPrivacy(
  level: InjectionPrivacyLevel,
  ctx: InjectionContext,
): string | null {
  switch (level) {
    case "absolute": {
      return "privacy:absolute_never_shared";
    }
    case "isolated": {
      if (!ctx.isPrivateChat) { return "privacy:isolated_requires_private_chat"; }
      return null;
    }
    case "localized": {
      if (!ctx.worldId) { return "privacy:localized_requires_world"; }
      return null;
    }
    case "contextual":
    case "shared":
    case "public":
    case "private":
    case "secret": {
      return null; // handled by provision pipeline
    }
  }
}
