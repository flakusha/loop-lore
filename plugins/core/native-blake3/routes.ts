/**
 * Native BLAKE3 plugin routes.
 *
 * Health probe for the native module integration sample — reports the
 * active implementation and binary status. Never throws: the native layer
 * is failure-tolerant by design.
 *
 * @module native-blake3-routes
 */

import { getBlake3Status } from "../../../src/native";

/**
 * GET /api/native/blake3/health
 *
 * @returns JSON status: active implementation, native availability, ABI
 *   version, binary path, platform.
 */
export function handleBlake3Health(): Response {
  return Response.json(getBlake3Status());
}
