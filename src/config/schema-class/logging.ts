// src/config/schema-class/logging.ts — logging section defaults
import { LogLevel, } from "../../db/enums";
import type { LoggingConfig, } from "../schema";

export const LOGGING_DEFAULTS = {
  level: LogLevel.Debug,
} satisfies LoggingConfig;
