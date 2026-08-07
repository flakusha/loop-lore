/**
 * NSFW Gate Middleware — enforces NSFW content gating.
 *
 * Original module split into domain modules; this barrel preserves the
 * public import surface (`nsfw-gate` / `nsfw-gate/index`).
 */
export {
  canAccessNsfw,
  checkChatNsfwAccess,
  checkIntimacyForNsfw,
  getActorContentRating,
} from "./access";
export { checkNsfwWithConsent, recordNsfwConsent, } from "./consent";
export { isNsfwRating, } from "./constants";
export { logNsfwEvent, } from "./logging";
