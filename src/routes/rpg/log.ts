import type { Logger, } from "../../logger";
import { getRpgLog, } from "../../rpg/shared/rpg-service-utils";

export function log(): Logger {
  return getRpgLog("rpg-routes",);
}
