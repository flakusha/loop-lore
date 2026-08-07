// src/config/schema-class/json-schema/auth.ts — auth JSON Schema section
export const auth = {
  type: "object",
  description: "Authentication configuration",
  properties: {
    required: { type: "boolean", default: false, description: "Require remote multi-user auth", },
    registrationOpen: { type: "boolean", default: true, description: "Allow new user registration", },
    sessionTimeoutHours: {
      type: "integer",
      default: 24,
      description: "Idle session timeout in hours",
    },
    maxSessionsPerUser: {
      type: "integer",
      default: 10,
      description: "Max simultaneous sessions per user",
    },
    demoUsername: { type: "string", default: "demo", description: "Demo username", },
    demoAutoSetup: {
      type: "boolean",
      default: true,
      description: "Auto-create sample data on first demo run",
    },
    adminUsername: {
      type: "string",
      default: "",
      description: "Bootstrap admin username (multi-user mode). Env: AUTH_ADMIN_USERNAME.",
    },
    adminPassword: {
      type: "string",
      default: "",
      description: "Bootstrap admin password (multi-user mode). Env-only preferred: AUTH_ADMIN_PASSWORD. Never commit.",
    },
  },
  required: [
    "required",
    "registrationOpen",
    "sessionTimeoutHours",
    "maxSessionsPerUser",
    "demoUsername",
    "demoAutoSetup",
  ],
};
