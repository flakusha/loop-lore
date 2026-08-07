/**
 * Shared key-rotation logger.
 */
import { getLogger, type Logger, } from "../../logger";

export function log(): Logger {
  return getLogger().child({ module: "crypto:key-rotation", },);
}
