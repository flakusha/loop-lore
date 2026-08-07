import { getLogger, type Logger, } from "../../logger/index.js";

export function log(): Logger {
  return getLogger().child({ module: "rpg-service", },);
}
