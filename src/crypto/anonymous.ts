/**
 * Anonymous Chat Mode
 *
 * When enabled, actor identities are hidden from other participants.
 * Messages display as "Anonymous" or numbered.
 * Actor can still decrypt own messages.
 * Admin sees real identities for moderation.
 */

import type { Config } from "../config/schema";

let _anonymousEnabled = false;

/**
 * Initialize anonymous chat mode from config.
 */
export function initAnonymousMode(config: Config): void {
  _anonymousEnabled = config.encryption.anonymous ?? false;
}

/**
 * Check if anonymous chat mode is enabled.
 */
export function isAnonymousModeEnabled(): boolean {
  return _anonymousEnabled;
}

/**
 * Get display name for an actor in anonymous mode.
 * Returns "Anonymous" for regular participants, real name for admins viewing.
 *
 * @param _actorId - The actor ID (unused but kept for API consistency)
 * @param actorName - The real actor name
 * @param isAdmin - Whether the viewer is an admin
 * @param isSelf - Whether the actor is the current user
 * @returns Anonymous display name or real name
 */
export function getAnonymousDisplayName(
  _actorId: string,
  actorName: string,
  isAdmin: boolean,
  isSelf: boolean,
): string {
  // Admins always see real names
  if (isAdmin) {
    return actorName;
  }

  // Users always see their own real name
  if (isSelf) {
    return actorName;
  }

  // In anonymous mode, return "Anonymous"
  if (_anonymousEnabled) {
    return "Anonymous";
  }

  // Default: return real name
  return actorName;
}

/**
 * Get anonymous avatar placeholder.
 * Returns null for real avatars, placeholder for anonymous.
 */
export function getAnonymousAvatar(
  _actorId: string,
  isAdmin: boolean,
  isSelf: boolean,
): string | null {
  // Admins and self see real avatars
  if (isAdmin || isSelf) {
    return null;
  }

  // In anonymous mode, return placeholder
  if (_anonymousEnabled) {
    return "👤";
  }

  return null;
}
