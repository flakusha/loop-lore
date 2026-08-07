import { getLogger, type Logger, } from "../../logger";

/** Logger bound to the battle routes module namespace. */
export function log(): Logger {
  return getLogger().child({ module: "battle-routes", },);
}
