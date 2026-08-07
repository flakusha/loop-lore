import { getLogger, type Logger, } from "../../logger";

export function log(): Logger {
  return getLogger().child({ module: "rpg-routes", },);
}
