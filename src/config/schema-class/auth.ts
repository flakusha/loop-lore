// src/config/schema-class/auth.ts — auth section defaults
import type { AuthConfig, } from "../schema";

export const AUTH_DEFAULTS = {
  required: false,
  registrationOpen: true,
  sessionTimeoutHours: 24,
  maxSessionsPerUser: 10,
  demoUsername: "demo",
  demoAutoSetup: true,
  adminUsername: "",
  adminPassword: "",
} satisfies AuthConfig;
