import { log as rootLog, } from "../logger";

export const log = rootLog.child({ module: "admin-models", },);
